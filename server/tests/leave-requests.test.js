import { describe, expect, it } from 'vitest';
import { LeaveBalance, LeaveRequest } from '../src/models/index.js';
import { as, createBalance, createLeaveType, createOrg, createUser, futureWeekdays, login, useTestDatabase, yesterday } from './helpers.js';

useTestDatabase();

async function setup(entitledDays = 10) {
  const org = await createOrg();
  const range = futureWeekdays(1, 3);
  await createBalance(org.employee, org.leaveType, range.year, entitledDays);
  const api = as(await login(org.employee));
  return { ...org, api, range };
}

const apply = (api, leaveType, startDate, endDate, reason = 'Personal work') =>
  api.post('/api/leave-requests').send({ leaveTypeId: leaveType.id, startDate, endDate, reason });

describe('Applying for leave', () => {
  it('creates a pending request with server-calculated working days and saves it to MongoDB', async () => {
    const { api, leaveType, range, employee, manager } = await setup();
    // Ignore any client-supplied day count: the server recalculates.
    const res = await api.post('/api/leave-requests').send({ leaveTypeId: leaveType.id, startDate: range.startDate, endDate: range.endDate, reason: 'Trip' });

    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({ status: 'Pending', days: 3, startDate: range.startDate, endDate: range.endDate, reason: 'Trip' });
    expect(res.body.request.manager.id).toBe(manager.id);

    const saved = await LeaveRequest.findById(res.body.request.id);
    expect(saved.employee.equals(employee._id)).toBe(true);
    expect(saved.days).toBe(3);
  });

  it('rejects unknown fields such as a client-supplied day count', async () => {
    const { api, leaveType, range } = await setup();
    const res = await api.post('/api/leave-requests').send({ leaveTypeId: leaveType.id, ...range, reason: 'Trip', days: 0.5 });
    expect(res.status).toBe(400);
  });

  it('excludes weekends from the day count', async () => {
    const { api, leaveType } = await setup();
    const monday = futureWeekdays(1, 1).startDate;
    const nextMonday = futureWeekdays(2, 1).startDate;
    const res = await apply(api, leaveType, monday, nextMonday);
    expect(res.status).toBe(201);
    expect(res.body.request.days).toBe(6);
  });

  it('rejects a range that contains only weekend days', async () => {
    const { api, leaveType } = await setup();
    const { startDate } = futureWeekdays(1, 1); // Monday
    const sat = new Date(`${startDate}T00:00:00Z`);
    sat.setUTCDate(sat.getUTCDate() + 5);
    const sun = new Date(sat);
    sun.setUTCDate(sun.getUTCDate() + 1);
    const res = await apply(api, leaveType, sat.toISOString().slice(0, 10), sun.toISOString().slice(0, 10));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/no working days/i);
  });

  it.each([
    ['malformed', '2026/01/05', '2026-01-06'],
    ['impossible', '2026-02-30', '2026-03-02'],
  ])('rejects %s dates', async (_label, startDate, endDate) => {
    const { api, leaveType } = await setup();
    const res = await apply(api, leaveType, startDate, endDate);
    expect(res.status).toBe(400);
  });

  it('rejects a start date after the end date', async () => {
    const { api, leaveType } = await setup();
    const res = await apply(api, leaveType, futureWeekdays(2, 1).startDate, futureWeekdays(1, 1).startDate);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/after the end date/i);
  });

  it('rejects a start date in the past', async () => {
    const { api, leaveType } = await setup();
    const res = await apply(api, leaveType, yesterday(), futureWeekdays(1, 1).startDate);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/past/i);
  });

  it('rejects requests that span two calendar years', async () => {
    const { api, leaveType } = await setup();
    const year = new Date().getFullYear() + 1;
    const res = await apply(api, leaveType, `${year}-12-30`, `${year + 1}-01-02`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/two calendar years/i);
  });

  it('rejects missing reason and inactive leave types', async () => {
    const { api, leaveType, range } = await setup();
    const noReason = await api.post('/api/leave-requests').send({ leaveTypeId: leaveType.id, startDate: range.startDate, endDate: range.endDate });
    expect(noReason.status).toBe(400);

    const inactive = await createLeaveType({ isActive: false });
    const res = await apply(api, inactive, range.startDate, range.endDate);
    expect(res.status).toBe(400);
  });

  it('rejects employees without an assigned manager', async () => {
    const leaveType = await createLeaveType();
    const loner = await createUser({ manager: null });
    const res = await apply(as(await login(loner)), leaveType, futureWeekdays(1, 1).startDate, futureWeekdays(1, 1).endDate);
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/reporting manager/i);
  });
});

describe('Overlapping requests', () => {
  it('rejects requests overlapping a pending or approved request', async () => {
    const { api, leaveType, range } = await setup(20);
    await apply(api, leaveType, range.startDate, range.endDate).expect(201);

    const overlap = await apply(api, leaveType, range.endDate, range.endDate);
    expect(overlap.status).toBe(409);

    await LeaveRequest.updateMany({}, { status: 'Approved' });
    const overlapApproved = await apply(api, leaveType, range.startDate, range.startDate);
    expect(overlapApproved.status).toBe(409);
  });

  it('allows new requests over the dates of a rejected request', async () => {
    const { api, leaveType, range } = await setup(20);
    await apply(api, leaveType, range.startDate, range.endDate).expect(201);
    await LeaveRequest.updateMany({}, { status: 'Rejected' });
    await LeaveBalance.updateMany({}, { pendingDays: 0 });
    await apply(api, leaveType, range.startDate, range.endDate).expect(201);
  });

  it("does not treat another employee's leave as an overlap", async () => {
    const { api, leaveType, range, employee2 } = await setup(20);
    await createBalance(employee2, leaveType, range.year, 20);
    await apply(api, leaveType, range.startDate, range.endDate).expect(201);
    await apply(as(await login(employee2)), leaveType, range.startDate, range.endDate).expect(201);
  });
});

describe('Leave balance', () => {
  it('reserves pending days and reports available = entitled - used - pending', async () => {
    const { api, leaveType, range } = await setup(10);
    await apply(api, leaveType, range.startDate, range.endDate).expect(201);

    const res = await api.get(`/api/leave-balances/me?year=${range.year}`);
    expect(res.status).toBe(200);
    const bal = res.body.balances.find((b) => b.leaveType.id === leaveType.id);
    expect(bal).toMatchObject({ entitledDays: 10, totalEntitled: 10, usedDays: 0, pendingDays: 3, availableDays: 7 });
  });

  it('includes carry-forward days in the total entitlement', async () => {
    const org = await createOrg();
    const range = futureWeekdays(1, 3);
    await createBalance(org.employee, org.leaveType, range.year, 2, { carryForwardDays: 1 });
    const res = await apply(as(await login(org.employee)), org.leaveType, range.startDate, range.endDate);
    expect(res.status).toBe(201);
  });

  it('rejects applications exceeding the available balance, counting pending reservations', async () => {
    const { api, leaveType } = await setup(4);
    await apply(api, leaveType, futureWeekdays(1, 3).startDate, futureWeekdays(1, 3).endDate).expect(201);

    const res = await apply(api, leaveType, futureWeekdays(2, 2).startDate, futureWeekdays(2, 2).endDate);
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/insufficient/i);
    expect(res.body.error.details).toEqual({ requestedDays: 2, availableDays: 1 });

    const bal = await LeaveBalance.findOne({ leaveType: leaveType._id });
    expect(bal.pendingDays).toBe(3);
  });

  it('cannot overdraw the balance with concurrent applications', async () => {
    const { api, leaveType } = await setup(3);
    const results = await Promise.all([1, 2, 3].map((w) => apply(api, leaveType, futureWeekdays(w, 2).startDate, futureWeekdays(w, 2).endDate)));
    const created = results.filter((r) => r.status === 201);
    expect(created).toHaveLength(1);
    const bal = await LeaveBalance.findOne({ leaveType: leaveType._id });
    expect(bal.pendingDays).toBe(2);
  });

  it('creates a balance from the leave type default when none was set', async () => {
    const org = await createOrg();
    const range = futureWeekdays(1, 2);
    const res = await apply(as(await login(org.employee)), org.leaveType, range.startDate, range.endDate);
    expect(res.status).toBe(201);
    const bal = await LeaveBalance.findOne({ employee: org.employee._id, year: range.year });
    expect(bal).toMatchObject({ entitledDays: 12, pendingDays: 2 });
  });
});

describe('Viewing leave requests', () => {
  it('lists only the signed-in employee’s own requests', async () => {
    const { api, leaveType, range, employee2 } = await setup(20);
    await createBalance(employee2, leaveType, range.year, 20);
    await apply(api, leaveType, range.startDate, range.endDate).expect(201);
    await apply(as(await login(employee2)), leaveType, range.startDate, range.endDate).expect(201);

    const res = await api.get('/api/leave-requests/mine');
    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(1);
  });

  it("prevents employees from reading another employee's request", async () => {
    const { api, leaveType, range, employee2 } = await setup(20);
    await createBalance(employee2, leaveType, range.year, 20);
    const other = await apply(as(await login(employee2)), leaveType, range.startDate, range.endDate);
    const res = await api.get(`/api/leave-requests/${other.body.request.id}`);
    expect(res.status).toBe(404);
  });

  it('allows the owner, their manager and an admin to read a request', async () => {
    const { api, leaveType, range, manager, admin, otherManager } = await setup(20);
    const created = await apply(api, leaveType, range.startDate, range.endDate);
    const url = `/api/leave-requests/${created.body.request.id}`;
    await api.get(url).expect(200);
    await as(await login(manager)).get(url).expect(200);
    await as(await login(admin)).get(url).expect(200);
    await as(await login(otherManager)).get(url).expect(404);
  });

  it('returns 400 for malformed ids', async () => {
    const { api } = await setup();
    await api.get('/api/leave-requests/not-an-id').expect(400);
  });

  it('employee dashboard returns profile, balances, totals and history', async () => {
    const { api, leaveType, range, manager } = await setup(10);
    await apply(api, leaveType, range.startDate, range.endDate).expect(201);
    const res = await api.get('/api/dashboard/employee');
    expect(res.status).toBe(200);
    expect(res.body.profile.manager.name).toBe(manager.name);
    expect(res.body.profile.passwordHash).toBeUndefined();
    expect(res.body.requestCounts.Pending).toBe(1);
    expect(res.body.recentRequests).toHaveLength(1);
    expect(res.body.leaveTypes.map((t) => t.id)).toContain(leaveType.id);
  });
});
