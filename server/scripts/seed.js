/**
 * Idempotent development seed.
 *
 * - Users, leave types, balances and sample requests are matched on natural keys and only
 *   inserted when missing ($setOnInsert), so rerunning never creates duplicates and never
 *   overwrites changes made through the application.
 * - Balance usage counters are then recalculated from the leave requests so they are consistent.
 *
 * Usage: npm run seed   (from the project root or the server folder)
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { config } from '../src/config/env.js';
import { LEAVE_STATUS, ROLES } from '../src/config/constants.js';
import { LeaveBalance, LeaveRequest, LeaveType, User } from '../src/models/index.js';
import { recalculateBalance } from '../src/services/balance.service.js';
import { addDays, countWorkingDays, todayDateOnly } from '../src/utils/dates.js';

const LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', description: 'Short personal leave for planned or unplanned needs.', defaultAnnualEntitlement: 12 },
  { code: 'SL', name: 'Sick Leave', description: 'Leave for illness or medical appointments.', defaultAnnualEntitlement: 10 },
  { code: 'EL', name: 'Earned Leave', description: 'Accrued annual leave for vacations and longer breaks.', defaultAnnualEntitlement: 15 },
];

const USERS = [
  { key: 'admin', name: 'Aditi Rao', email: 'admin@leaveportal.local', password: 'Admin@123', role: ROLES.ADMIN, department: 'Human Resources' },
  { key: 'manager', name: 'Meera Iyer', email: 'manager@leaveportal.local', password: 'Manager@123', role: ROLES.MANAGER, department: 'Engineering', managerKey: 'admin' },
  { key: 'emp1', name: 'Priya Sharma', email: 'priya@leaveportal.local', password: 'Employee@123', role: ROLES.EMPLOYEE, department: 'Engineering', managerKey: 'manager' },
  { key: 'emp2', name: 'Rahul Verma', email: 'rahul@leaveportal.local', password: 'Employee@123', role: ROLES.EMPLOYEE, department: 'Engineering', managerKey: 'manager' },
];

/** Next weekday-only range of `length` working days starting `weeksAhead` weeks from the coming Monday. */
function futureRange(weeksAhead, length) {
  const today = todayDateOnly();
  const daysToMonday = (8 - today.getUTCDay()) % 7 || 7;
  let start = addDays(today, daysToMonday + weeksAhead * 7);
  let end = addDays(start, length - 1);
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    start = addDays(start, 7);
    end = addDays(end, 7);
  }
  return { start, end };
}

/** A weekday-only range in the past, within the current year when possible. */
function pastRange(weeksBack, length) {
  const today = todayDateOnly();
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  let start = addDays(today, -daysSinceMonday - weeksBack * 7);
  if (start.getUTCFullYear() !== today.getUTCFullYear()) {
    start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    while ([0, 6].includes(start.getUTCDay())) start = addDays(start, 1);
  }
  return { start, end: addDays(start, length - 1) };
}

async function upsertUsers() {
  const ids = {};
  for (const u of USERS) {
    const passwordHash = await User.hashPassword(u.password);
    const doc = await User.findOneAndUpdate(
      { email: u.email },
      {
        $setOnInsert: {
          name: u.name,
          email: u.email,
          role: u.role,
          department: u.department,
          isActive: true,
          passwordHash,
          manager: u.managerKey ? ids[u.managerKey] : null,
        },
      },
      { upsert: true, new: true },
    );
    ids[u.key] = doc._id;
  }
  return ids;
}

async function upsertLeaveTypes() {
  const types = {};
  for (const t of LEAVE_TYPES) {
    types[t.code] = await LeaveType.findOneAndUpdate(
      { code: t.code },
      { $setOnInsert: { ...t, isActive: true } },
      { upsert: true, new: true },
    );
  }
  return types;
}

async function upsertBalances(userIds, types, year) {
  const holders = [userIds.manager, userIds.emp1, userIds.emp2];
  for (const employee of holders) {
    for (const type of Object.values(types)) {
      await LeaveBalance.findOneAndUpdate(
        { employee, leaveType: type._id, year },
        { $setOnInsert: { entitledDays: type.defaultAnnualEntitlement, carryForwardDays: 0, usedDays: 0, pendingDays: 0 } },
        { upsert: true, new: true },
      );
    }
  }
  return holders;
}

async function upsertRequests(userIds, types) {
  const now = new Date();
  const samples = [
    {
      employee: userIds.emp1, type: 'CL', ...pastRange(6, 2), status: LEAVE_STATUS.APPROVED,
      reason: 'Family function out of town.', reviewer: userIds.manager, remarks: 'Approved. Enjoy the function.',
    },
    { employee: userIds.emp1, type: 'EL', ...futureRange(2, 3), status: LEAVE_STATUS.PENDING, reason: 'Planned vacation with family.' },
    {
      employee: userIds.emp2, type: 'SL', ...pastRange(3, 1), status: LEAVE_STATUS.REJECTED,
      reason: 'Medical check-up.', reviewer: userIds.manager, remarks: 'Please re-apply with the correct date; this overlaps the release.',
    },
    { employee: userIds.emp2, type: 'CL', ...futureRange(1, 1), status: LEAVE_STATUS.PENDING, reason: 'Personal errand at the bank.' },
    { employee: userIds.manager, type: 'EL', ...futureRange(4, 2), status: LEAVE_STATUS.PENDING, reason: 'Attending a friend’s wedding.' },
  ];

  for (const s of samples) {
    const leaveType = types[s.type];
    const reviewed = s.status !== LEAVE_STATUS.PENDING;
    const employee = await User.findById(s.employee);
    // The reason text is the natural key for sample requests, so rerunning on another day
    // does not add a second copy with different dates.
    await LeaveRequest.findOneAndUpdate(
      { employee: s.employee, leaveType: leaveType._id, reason: s.reason },
      {
        $setOnInsert: {
          startDate: s.start,
          endDate: s.end,
          days: countWorkingDays(s.start, s.end),
          year: s.start.getUTCFullYear(),
          status: s.status,
          manager: employee.manager,
          managerRemarks: reviewed ? s.remarks : '',
          reviewedBy: reviewed ? s.reviewer : null,
          reviewedAt: reviewed ? now : null,
        },
      },
      { upsert: true, new: true },
    );
  }
}

async function main() {
  await connectDB(config.mongoUri);
  console.log(`[seed] Connected to ${mongoose.connection.name}`);
  await Promise.all([User.init(), LeaveType.init(), LeaveBalance.init(), LeaveRequest.init()]);

  const year = todayDateOnly().getUTCFullYear();
  const userIds = await upsertUsers();
  const types = await upsertLeaveTypes();
  await upsertBalances(userIds, types, year);
  await upsertRequests(userIds, types);

  // Make sure every balance touched by a sample request exists, then rebuild counters.
  const combos = await LeaveRequest.aggregate([
    { $match: { employee: { $in: Object.values(userIds) } } },
    { $group: { _id: { employee: '$employee', leaveType: '$leaveType', year: '$year' } } },
  ]);
  for (const { _id } of combos) {
    const type = await LeaveType.findById(_id.leaveType);
    await LeaveBalance.updateOne(
      { employee: _id.employee, leaveType: _id.leaveType, year: _id.year },
      { $setOnInsert: { entitledDays: type.defaultAnnualEntitlement, carryForwardDays: 0, usedDays: 0, pendingDays: 0 } },
      { upsert: true },
    );
    await recalculateBalance(_id.employee, _id.leaveType, _id.year);
  }

  const counts = await Promise.all([
    User.countDocuments(),
    LeaveType.countDocuments(),
    LeaveBalance.countDocuments(),
    LeaveRequest.countDocuments(),
  ]);
  console.log(`[seed] Done. users=${counts[0]} leaveTypes=${counts[1]} balances=${counts[2]} requests=${counts[3]}`);
  console.log('[seed] Demo logins:');
  for (const u of USERS) console.log(`        ${u.role.padEnd(8)} ${u.email}  /  ${u.password}`);
}

main()
  .catch((err) => {
    console.error('[seed] Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
