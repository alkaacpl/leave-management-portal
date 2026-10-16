import mongoose from 'mongoose';
import { LEAVE_APPLICANT_ROLES, LEAVE_STATUS } from '../config/constants.js';
import { LeaveBalance, LeaveRequest, LeaveType, User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';

/** Expression for "entitled + carry-forward - used - pending" usable inside $expr. */
const availableExpr = {
  $subtract: [{ $add: ['$entitledDays', { $ifNull: ['$carryForwardDays', 0] }] }, { $add: ['$usedDays', '$pendingDays'] }],
};

export function serializeBalance(balance) {
  const json = typeof balance.toJSON === 'function' ? balance.toJSON() : { ...balance };
  const carry = json.carryForwardDays || 0;
  json.totalEntitled = json.entitledDays + carry;
  json.availableDays = json.totalEntitled - json.usedDays - json.pendingDays;
  return json;
}

/**
 * Get the balance row for employee/type/year, creating it from the leave type's default
 * entitlement if it does not exist yet. Uses an upsert so concurrent calls cannot create duplicates.
 */
export async function ensureBalance(employeeId, leaveType, year) {
  try {
    return await LeaveBalance.findOneAndUpdate(
      { employee: employeeId, leaveType: leaveType._id, year },
      { $setOnInsert: { entitledDays: leaveType.defaultAnnualEntitlement, carryForwardDays: 0, usedDays: 0, pendingDays: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    // Two parallel upserts can race on the unique index; the loser simply reads the winner's row.
    if (err?.code === 11000) {
      return LeaveBalance.findOne({ employee: employeeId, leaveType: leaveType._id, year });
    }
    throw err;
  }
}

/** Ensure balances exist for every active leave type, then return all balances for that year. */
export async function getEmployeeBalances(employeeId, year) {
  const activeTypes = await LeaveType.find({ isActive: true });
  await Promise.all(activeTypes.map((type) => ensureBalance(employeeId, type, year)));
  const balances = await LeaveBalance.find({ employee: employeeId, year }).populate('leaveType');
  return balances
    .filter((b) => b.leaveType && (b.leaveType.isActive || b.usedDays > 0 || b.pendingDays > 0))
    .sort((a, b) => a.leaveType.name.localeCompare(b.leaveType.name))
    .map(serializeBalance);
}

/** Atomically reserve days against a balance. Returns null if the balance is insufficient. */
export function reserveDays(balanceId, days) {
  return LeaveBalance.findOneAndUpdate(
    { _id: balanceId, $expr: { $gte: [availableExpr, days] } },
    { $inc: { pendingDays: days } },
    { new: true },
  );
}

export function releaseReservation(balanceId, days) {
  return LeaveBalance.findOneAndUpdate({ _id: balanceId }, { $inc: { pendingDays: -days } }, { new: true });
}

export function convertReservationToUsage(balanceId, days) {
  return LeaveBalance.findOneAndUpdate({ _id: balanceId }, { $inc: { pendingDays: -days, usedDays: days } }, { new: true });
}

/**
 * Rebuild usedDays/pendingDays for one balance from its leave requests.
 * Used by the seed script and available as a repair tool.
 */
export async function recalculateBalance(employeeId, leaveTypeId, year) {
  const totals = await LeaveRequest.aggregate([
    {
      $match: {
        employee: new mongoose.Types.ObjectId(String(employeeId)),
        leaveType: new mongoose.Types.ObjectId(String(leaveTypeId)),
        year,
        status: { $in: [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED] },
      },
    },
    { $group: { _id: '$status', days: { $sum: '$days' } } },
  ]);
  const used = totals.find((t) => t._id === LEAVE_STATUS.APPROVED)?.days || 0;
  const pending = totals.find((t) => t._id === LEAVE_STATUS.PENDING)?.days || 0;
  return LeaveBalance.findOneAndUpdate(
    { employee: employeeId, leaveType: leaveTypeId, year },
    { $set: { usedDays: used, pendingDays: pending } },
    { new: true },
  );
}

/** Admin: create an entitlement row. Rejects duplicates for the same employee/type/year. */
export async function createEntitlement({ employeeId, leaveTypeId, year, entitledDays, carryForwardDays }) {
  const [employee, leaveType] = await Promise.all([User.findById(employeeId), LeaveType.findById(leaveTypeId)]);
  if (!employee) throw AppError.notFound('Employee not found.');
  if (!LEAVE_APPLICANT_ROLES.includes(employee.role)) {
    throw AppError.badRequest('Entitlements can only be set for employees and managers.');
  }
  if (!leaveType) throw AppError.notFound('Leave type not found.');

  const existing = await LeaveBalance.findOne({ employee: employeeId, leaveType: leaveTypeId, year });
  if (existing) {
    throw AppError.conflict('An entitlement already exists for this employee, leave type and year. Update it instead.', {
      id: existing.id,
    });
  }
  const balance = await LeaveBalance.create({ employee: employeeId, leaveType: leaveTypeId, year, entitledDays, carryForwardDays });
  await balance.populate([{ path: 'employee', select: 'name email role isActive' }, 'leaveType']);
  return serializeBalance(balance);
}

/**
 * Admin: update entitled/carry-forward days. The new total may not drop below the days already
 * used or reserved, which is enforced atomically in the update filter.
 */
export async function updateEntitlement(balanceId, changes) {
  const current = await LeaveBalance.findById(balanceId);
  if (!current) throw AppError.notFound('Leave balance not found.');

  const entitledDays = changes.entitledDays ?? current.entitledDays;
  const carryForwardDays = changes.carryForwardDays ?? current.carryForwardDays ?? 0;
  const newTotal = entitledDays + carryForwardDays;

  const updated = await LeaveBalance.findOneAndUpdate(
    { _id: balanceId, $expr: { $gte: [newTotal, { $add: ['$usedDays', '$pendingDays'] }] } },
    { $set: { entitledDays, carryForwardDays } },
    { new: true, runValidators: true },
  ).populate([{ path: 'employee', select: 'name email role isActive' }, 'leaveType']);

  if (!updated) {
    const fresh = await LeaveBalance.findById(balanceId);
    throw AppError.unprocessable(
      `Total entitlement (${newTotal}) cannot be less than days already used and reserved (${fresh.usedDays + fresh.pendingDays}).`,
    );
  }
  return serializeBalance(updated);
}
