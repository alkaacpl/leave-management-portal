import { ACTIVE_LEAVE_STATUSES, LEAVE_STATUS, REVIEWER_ROLES, ROLES } from '../config/constants.js';
import { LeaveBalance, LeaveRequest, LeaveType, User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { countWorkingDays, parseDateOnly, todayDateOnly } from '../utils/dates.js';
import {
  convertReservationToUsage,
  ensureBalance,
  releaseReservation,
  reserveDays,
  serializeBalance,
} from './balance.service.js';
import { notifyLeaveReviewed, notifyLeaveSubmitted } from './email/notifications.js';

const REQUEST_POPULATE = [
  { path: 'employee', select: 'name email department role isActive manager' },
  { path: 'leaveType', select: 'name code isActive' },
  { path: 'manager', select: 'name email' },
  { path: 'reviewedBy', select: 'name email role' },
];

/**
 * Validate and create a leave request, reserving the days against the employee's balance.
 * All rules are enforced here regardless of what the client sends.
 */
export async function applyForLeave(user, { leaveTypeId, startDate, endDate, reason }) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start) throw AppError.badRequest('Start date is not a valid calendar date.');
  if (!end) throw AppError.badRequest('End date is not a valid calendar date.');
  if (start > end) throw AppError.badRequest('Start date cannot be after the end date.');
  if (start < todayDateOnly()) throw AppError.badRequest('Start date cannot be in the past.');
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    throw AppError.badRequest(
      'Leave requests cannot span two calendar years. Submit separate requests for each year (e.g. one ending 31 December and one starting 1 January).',
    );
  }

  const days = countWorkingDays(start, end);
  if (days < 1) throw AppError.badRequest('The selected dates contain no working days (Monday to Friday).');

  const leaveType = await LeaveType.findById(leaveTypeId);
  if (!leaveType) throw AppError.notFound('Leave type not found.');
  if (!leaveType.isActive) throw AppError.badRequest('This leave type is no longer available.');

  if (!user.manager) {
    throw AppError.unprocessable('You do not have a reporting manager assigned. Please contact an administrator.');
  }
  const manager = await User.findById(user.manager);
  if (!manager || !manager.isActive || !REVIEWER_ROLES.includes(manager.role)) {
    throw AppError.unprocessable('Your reporting manager is not active. Please contact an administrator.');
  }

  const overlapping = await LeaveRequest.findOne({
    employee: user._id,
    status: { $in: ACTIVE_LEAVE_STATUSES },
    startDate: { $lte: end },
    endDate: { $gte: start },
  });
  if (overlapping) {
    throw AppError.conflict('These dates overlap with an existing pending or approved leave request.', {
      conflictingRequestId: overlapping.id,
    });
  }

  const year = start.getUTCFullYear();
  const balance = await ensureBalance(user._id, leaveType, year);
  const reserved = await reserveDays(balance._id, days);
  if (!reserved) {
    const current = serializeBalance(await LeaveBalance.findById(balance._id));
    throw AppError.unprocessable(
      `Insufficient ${leaveType.name} balance: ${days} day(s) requested, ${current.availableDays} day(s) available.`,
      { requestedDays: days, availableDays: current.availableDays },
    );
  }

  let request;
  try {
    request = await LeaveRequest.create({
      employee: user._id,
      leaveType: leaveType._id,
      startDate: start,
      endDate: end,
      days,
      year,
      reason,
      manager: manager._id,
      status: LEAVE_STATUS.PENDING,
    });
  } catch (err) {
    // Give the reservation back if the request could not be saved.
    await releaseReservation(balance._id, days);
    throw err;
  }

  await request.populate(REQUEST_POPULATE);
  // Saved successfully: notify in the background. Email failures never affect the request.
  notifyLeaveSubmitted(request);
  return request;
}

/** A user may view a request if they own it, are the employee's current manager, or are an admin. */
export async function getRequestForViewer(viewer, requestId) {
  const request = await LeaveRequest.findById(requestId).populate(REQUEST_POPULATE);
  if (!request) throw AppError.notFound('Leave request not found.');

  const ownerId = request.employee?._id;
  const isOwner = ownerId?.equals(viewer._id);
  const isManager = request.employee?.manager?.equals(viewer._id);
  const isAdmin = viewer.role === ROLES.ADMIN;
  if (!isOwner && !isManager && !isAdmin) {
    // Do not reveal whether someone else's request exists.
    throw AppError.notFound('Leave request not found.');
  }
  return request;
}

export async function reviewLeaveRequest(reviewer, requestId, { status, remarks }) {
  const request = await LeaveRequest.findById(requestId).populate('employee', 'name email manager');
  if (!request) throw AppError.notFound('Leave request not found.');

  if (request.employee?._id.equals(reviewer._id)) {
    throw AppError.forbidden('You cannot review your own leave request.');
  }
  if (!request.employee?.manager || !request.employee.manager.equals(reviewer._id)) {
    throw AppError.forbidden('You can only review leave requests from employees assigned to you.');
  }
  if (request.status !== LEAVE_STATUS.PENDING) {
    throw AppError.conflict(`This request has already been ${request.status.toLowerCase()}.`);
  }

  // Conditional update guarantees only one decision even if two reviews race.
  const updated = await LeaveRequest.findOneAndUpdate(
    { _id: request._id, status: LEAVE_STATUS.PENDING },
    {
      $set: {
        status,
        managerRemarks: remarks || '',
        reviewedBy: reviewer._id,
        reviewedAt: new Date(),
        manager: reviewer._id,
      },
    },
    { new: true },
  );
  if (!updated) throw AppError.conflict('This request has already been reviewed.');

  const balanceFilter = { employee: updated.employee, leaveType: updated.leaveType, year: updated.year };
  const balance = await LeaveBalance.findOne(balanceFilter);
  if (balance) {
    if (status === LEAVE_STATUS.APPROVED) await convertReservationToUsage(balance._id, updated.days);
    else await releaseReservation(balance._id, updated.days);
  }

  await updated.populate(REQUEST_POPULATE);
  notifyLeaveReviewed(updated);
  return updated;
}

function buildListFilter(base, { status, year } = {}) {
  const filter = { ...base };
  if (status) filter.status = status;
  if (year) filter.year = year;
  return filter;
}

export function listOwnRequests(userId, query) {
  return LeaveRequest.find(buildListFilter({ employee: userId }, query))
    .sort({ startDate: -1, createdAt: -1 })
    .populate(REQUEST_POPULATE);
}

export async function getTeamMemberIds(managerId) {
  const members = await User.find({ manager: managerId }).select('_id');
  return members.map((m) => m._id);
}

export async function listTeamRequests(managerId, query) {
  const memberIds = await getTeamMemberIds(managerId);
  return LeaveRequest.find(buildListFilter({ employee: { $in: memberIds } }, query))
    .sort({ createdAt: -1 })
    .populate(REQUEST_POPULATE);
}

/** Pending requests for a manager's team, each annotated with the employee's current balance. */
export async function listPendingForManager(managerId) {
  const requests = await listTeamRequests(managerId, { status: LEAVE_STATUS.PENDING });
  if (requests.length === 0) return [];

  const balances = await LeaveBalance.find({
    $or: requests.map((r) => ({ employee: r.employee._id, leaveType: r.leaveType._id, year: r.year })),
  });
  const key = (e, t, y) => `${e}:${t}:${y}`;
  const byKey = new Map(balances.map((b) => [key(b.employee, b.leaveType, b.year), serializeBalance(b)]));

  return requests
    .sort((a, b) => a.startDate - b.startDate)
    .map((r) => {
      const json = r.toJSON();
      const balance = byKey.get(key(r.employee._id, r.leaveType._id, r.year));
      json.balance = balance
        ? {
            totalEntitled: balance.totalEntitled,
            usedDays: balance.usedDays,
            pendingDays: balance.pendingDays,
            availableDays: balance.availableDays,
          }
        : null;
      return json;
    });
}
