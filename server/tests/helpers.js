import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { ROLES } from '../src/config/constants.js';
import { LeaveBalance, LeaveRequest, LeaveType, User } from '../src/models/index.js';
import { addDays, formatDateOnly, todayDateOnly } from '../src/utils/dates.js';

export const app = createApp();
export const PASSWORD = 'Passw0rd!';

/**
 * Connect to a uniquely named database for this test file and drop it afterwards,
 * so test files can run in parallel without sharing or leaving data behind.
 */
export function useTestDatabase() {
  beforeAll(async () => {
    const base = new URL(process.env.MONGODB_URI_TEST);
    base.pathname = `/lmp_test_${randomUUID().slice(0, 8)}`;
    await mongoose.connect(base.toString(), { serverSelectionTimeoutMS: 5000 });
    await Promise.all([User.init(), LeaveType.init(), LeaveBalance.init(), LeaveRequest.init()]);
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), LeaveType.deleteMany({}), LeaveBalance.deleteMany({}), LeaveRequest.deleteMany({})]);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
}

let counter = 0;
export async function createUser(overrides = {}) {
  counter += 1;
  return User.create({
    name: overrides.name || `User ${counter}`,
    email: overrides.email || `user${counter}-${randomUUID().slice(0, 6)}@test.local`,
    role: overrides.role || ROLES.EMPLOYEE,
    isActive: overrides.isActive ?? true,
    manager: overrides.manager ?? null,
    department: overrides.department || '',
    passwordHash: await User.hashPassword(overrides.password || PASSWORD),
  });
}

export function createLeaveType(overrides = {}) {
  counter += 1;
  return LeaveType.create({
    name: overrides.name || `Leave ${counter}`,
    code: overrides.code || `LT${counter}`,
    description: overrides.description || '',
    defaultAnnualEntitlement: overrides.defaultAnnualEntitlement ?? 10,
    isActive: overrides.isActive ?? true,
  });
}

export function createBalance(employee, leaveType, year, entitledDays, extra = {}) {
  return LeaveBalance.create({ employee: employee._id, leaveType: leaveType._id, year, entitledDays, ...extra });
}

/** Admin, manager and two employees reporting to the manager, plus one leave type. */
export async function createOrg() {
  const admin = await createUser({ role: ROLES.ADMIN, name: 'Admin' });
  const manager = await createUser({ role: ROLES.MANAGER, name: 'Manager', manager: admin._id });
  const otherManager = await createUser({ role: ROLES.MANAGER, name: 'Other Manager', manager: admin._id });
  const employee = await createUser({ name: 'Employee One', manager: manager._id });
  const employee2 = await createUser({ name: 'Employee Two', manager: manager._id });
  const outsider = await createUser({ name: 'Outsider', manager: otherManager._id });
  const leaveType = await createLeaveType({ name: 'Casual Leave', code: 'CL', defaultAnnualEntitlement: 12 });
  return { admin, manager, otherManager, employee, employee2, outsider, leaveType };
}

export async function login(user) {
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${user.email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

/** Supertest wrapper that sends a bearer token. */
export function as(token) {
  const withAuth = (req) => req.set('Authorization', `Bearer ${token}`);
  return {
    get: (url) => withAuth(request(app).get(url)),
    post: (url) => withAuth(request(app).post(url)),
    patch: (url) => withAuth(request(app).patch(url)),
  };
}

/**
 * A future Monday-based range of `length` working days (1-5), `weeksAhead` weeks after next Monday.
 * Never spans two calendar years. Returns strings plus the balance year.
 */
export function futureWeekdays(weeksAhead = 0, length = 1) {
  const today = todayDateOnly();
  const daysToMonday = (8 - today.getUTCDay()) % 7 || 7;
  let start = addDays(today, daysToMonday + weeksAhead * 7);
  let end = addDays(start, length - 1);
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    start = addDays(start, 7);
    end = addDays(end, 7);
  }
  return { startDate: formatDateOnly(start), endDate: formatDateOnly(end), year: start.getUTCFullYear() };
}

export function yesterday() {
  return formatDateOnly(addDays(todayDateOnly(), -1));
}
