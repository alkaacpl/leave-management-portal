import { LEAVE_STATUS, ROLES } from '../../config/constants.js';
import { LeaveRequest, LeaveType, User } from '../../models/index.js';
import { getEmployeeBalances } from '../../services/balance.service.js';
import { getTeamMemberIds, listOwnRequests, listPendingForManager } from '../../services/leave.service.js';
import { currentYear, todayDateOnly } from '../../utils/dates.js';

function countByStatus(requests) {
  const counts = { Pending: 0, Approved: 0, Rejected: 0 };
  for (const r of requests) counts[r.status] += 1;
  return counts;
}

export async function employeeDashboard(req, res) {
  const year = currentYear();
  const [profile, balances, requests, leaveTypes] = await Promise.all([
    User.findById(req.user._id).populate('manager', 'name email'),
    getEmployeeBalances(req.user._id, year),
    listOwnRequests(req.user._id),
    LeaveType.find({ isActive: true }).sort({ name: 1 }).select('name code description'),
  ]);

  const totals = balances.reduce(
    (acc, b) => ({
      totalEntitled: acc.totalEntitled + b.totalEntitled,
      usedDays: acc.usedDays + b.usedDays,
      pendingDays: acc.pendingDays + b.pendingDays,
      availableDays: acc.availableDays + b.availableDays,
    }),
    { totalEntitled: 0, usedDays: 0, pendingDays: 0, availableDays: 0 },
  );

  res.json({
    year,
    profile,
    balances,
    totals,
    leaveTypes,
    requestCounts: countByStatus(requests),
    recentRequests: requests.slice(0, 5),
  });
}

export async function managerDashboard(req, res) {
  const year = currentYear();
  const memberIds = await getTeamMemberIds(req.user._id);
  const [team, pending, reviewedThisYear, onLeaveToday] = await Promise.all([
    User.find({ _id: { $in: memberIds } }).sort({ name: 1 }).select('name email department role isActive'),
    listPendingForManager(req.user._id),
    LeaveRequest.aggregate([
      { $match: { employee: { $in: memberIds }, year, status: { $in: [LEAVE_STATUS.APPROVED, LEAVE_STATUS.REJECTED] } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    LeaveRequest.countDocuments({
      employee: { $in: memberIds },
      status: LEAVE_STATUS.APPROVED,
      startDate: { $lte: todayDateOnly() },
      endDate: { $gte: todayDateOnly() },
    }),
  ]);

  res.json({
    year,
    stats: {
      teamSize: team.length,
      pendingCount: pending.length,
      approvedThisYear: reviewedThisYear.find((r) => r._id === LEAVE_STATUS.APPROVED)?.count || 0,
      rejectedThisYear: reviewedThisYear.find((r) => r._id === LEAVE_STATUS.REJECTED)?.count || 0,
      onLeaveToday,
    },
    team,
    pendingRequests: pending,
  });
}

export async function adminDashboard(_req, res) {
  const [roleCounts, inactiveUsers, leaveTypeCounts, statusCounts, recentRequests] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    User.countDocuments({ isActive: false }),
    LeaveType.aggregate([{ $group: { _id: '$isActive', count: { $sum: 1 } } }]),
    LeaveRequest.aggregate([{ $match: { year: currentYear() } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    LeaveRequest.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .populate([
        { path: 'employee', select: 'name email' },
        { path: 'leaveType', select: 'name code' },
        { path: 'reviewedBy', select: 'name' },
      ]),
  ]);

  const byRole = Object.fromEntries(roleCounts.map((r) => [r._id, r.count]));
  const byStatus = Object.fromEntries(statusCounts.map((r) => [r._id, r.count]));
  res.json({
    year: currentYear(),
    stats: {
      employees: byRole[ROLES.EMPLOYEE] || 0,
      managers: byRole[ROLES.MANAGER] || 0,
      admins: byRole[ROLES.ADMIN] || 0,
      inactiveUsers,
      activeLeaveTypes: leaveTypeCounts.find((c) => c._id === true)?.count || 0,
      inactiveLeaveTypes: leaveTypeCounts.find((c) => c._id === false)?.count || 0,
      pendingRequests: byStatus[LEAVE_STATUS.PENDING] || 0,
      approvedRequests: byStatus[LEAVE_STATUS.APPROVED] || 0,
      rejectedRequests: byStatus[LEAVE_STATUS.REJECTED] || 0,
    },
    recentRequests,
  });
}
