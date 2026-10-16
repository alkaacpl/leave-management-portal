import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { LeaveBalance, LeaveRequest, User } from '../src/models/index.js';
import { app, as, createBalance, createOrg, futureWeekdays, login, useTestDatabase } from './helpers.js';

useTestDatabase();

async function adminApi() {
  const org = await createOrg();
  return { ...org, api: as(await login(org.admin)) };
}

describe('Admin: employee management', () => {
  it('lists users without password hashes and supports filters', async () => {
    const { api } = await adminApi();
    const res = await api.get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBe(6);
    expect(res.body.users.every((u) => u.passwordHash === undefined)).toBe(true);

    const managers = await api.get('/api/admin/users?role=manager');
    expect(managers.body.users.map((u) => u.name).sort()).toEqual(['Manager', 'Other Manager']);

    const search = await api.get('/api/admin/users?search=employee%20one');
    expect(search.body.users).toHaveLength(1);
  });

  it('creates employee, manager and admin accounts that can log in', async () => {
    const { api, manager } = await adminApi();
    for (const role of ['employee', 'manager', 'admin']) {
      const email = `new-${role}@test.local`;
      const res = await api.post('/api/admin/users').send({
        name: `New ${role}`,
        email,
        password: 'Welcome123',
        role,
        managerId: role === 'employee' ? manager.id : null,
        department: 'Ops',
      });
      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({ email, role, isActive: true });
      expect(res.body.user.passwordHash).toBeUndefined();
      await request(app).post('/api/auth/login').send({ email, password: 'Welcome123' }).expect(200);
    }
    const stored = await User.findOne({ email: 'new-employee@test.local' }).select('+passwordHash');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored.manager.equals(manager._id)).toBe(true);
  });

  it('validates new accounts: duplicate email, weak password, invalid manager', async () => {
    const { api, employee, employee2 } = await adminApi();
    const dup = await api.post('/api/admin/users').send({ name: 'Dup', email: employee.email, password: 'Welcome123', role: 'employee' });
    expect(dup.status).toBe(409);

    const weak = await api.post('/api/admin/users').send({ name: 'Weak', email: 'weak@test.local', password: 'short', role: 'employee' });
    expect(weak.status).toBe(400);

    const badManager = await api
      .post('/api/admin/users')
      .send({ name: 'Bad', email: 'bad@test.local', password: 'Welcome123', role: 'employee', managerId: employee2.id });
    expect(badManager.status).toBe(400);
    expect(badManager.body.error.message).toMatch(/manager or admin role/i);
  });

  it('edits user details, changes roles and reassigns managers', async () => {
    const { api, employee, otherManager } = await adminApi();
    const res = await api.patch(`/api/admin/users/${employee.id}`).send({ name: 'Renamed', department: 'QA', managerId: otherManager.id, role: 'manager' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Renamed', department: 'QA', role: 'manager' });
    expect(res.body.user.manager.id).toBe(otherManager.id);

    const show = await api.get(`/api/admin/users/${employee.id}`);
    expect(show.body.user.name).toBe('Renamed');
  });

  it('deactivates and reactivates accounts; deactivated users cannot log in', async () => {
    const { api, employee } = await adminApi();
    await api.patch(`/api/admin/users/${employee.id}`).send({ isActive: false }).expect(200);
    await request(app).post('/api/auth/login').send({ email: employee.email, password: 'Passw0rd!' }).expect(403);
    await api.patch(`/api/admin/users/${employee.id}`).send({ isActive: true }).expect(200);
    await request(app).post('/api/auth/login').send({ email: employee.email, password: 'Passw0rd!' }).expect(200);
  });

  it('protects against admin self-lockout and orphaning reports', async () => {
    const { api, admin, manager } = await adminApi();
    await api.patch(`/api/admin/users/${admin.id}`).send({ role: 'employee' }).expect(403);
    await api.patch(`/api/admin/users/${admin.id}`).send({ isActive: false }).expect(403);
    const demote = await api.patch(`/api/admin/users/${manager.id}`).send({ role: 'employee' });
    expect(demote.status).toBe(409);
    await api.patch(`/api/admin/users/${manager.id}`).send({ isActive: false }).expect(409);
  });

  it('rejects self-management and circular reporting lines', async () => {
    const { api, admin, manager } = await adminApi();
    await api.patch(`/api/admin/users/${manager.id}`).send({ managerId: manager.id }).expect(400);
    // manager reports to admin; making admin report to manager would be a cycle.
    const cycle = await api.patch(`/api/admin/users/${admin.id}`).send({ managerId: manager.id });
    expect(cycle.status).toBe(400);
    expect(cycle.body.error.message).toMatch(/circular/i);
  });

  it('returns 404 for unknown users', async () => {
    const { api } = await adminApi();
    await api.get('/api/admin/users/64b000000000000000000000').expect(404);
  });
});

describe('Admin: leave types', () => {
  it('creates, edits, deactivates and lists leave types', async () => {
    const { api } = await adminApi();
    const created = await api.post('/api/admin/leave-types').send({ name: 'Paternity Leave', code: 'pl', description: 'For new fathers', defaultAnnualEntitlement: 5 });
    expect(created.status).toBe(201);
    expect(created.body.leaveType).toMatchObject({ code: 'PL', isActive: true, defaultAnnualEntitlement: 5 });

    const id = created.body.leaveType.id;
    const edited = await api.patch(`/api/admin/leave-types/${id}`).send({ name: 'Parental Leave', description: 'For new parents', defaultAnnualEntitlement: 10 });
    expect(edited.body.leaveType).toMatchObject({ name: 'Parental Leave', description: 'For new parents', defaultAnnualEntitlement: 10 });

    const off = await api.patch(`/api/admin/leave-types/${id}`).send({ isActive: false });
    expect(off.body.leaveType.isActive).toBe(false);

    const list = await api.get('/api/admin/leave-types');
    expect(list.body.leaveTypes.map((t) => t.code).sort()).toEqual(['CL', 'PL']);
  });

  it('rejects duplicate codes, invalid entitlements and code edits', async () => {
    const { api, leaveType } = await adminApi();
    await api.post('/api/admin/leave-types').send({ name: 'Another', code: 'CL', defaultAnnualEntitlement: 1 }).expect(409);
    await api.post('/api/admin/leave-types').send({ name: 'Neg', code: 'NG', defaultAnnualEntitlement: -1 }).expect(400);
    await api.patch(`/api/admin/leave-types/${leaveType.id}`).send({ code: 'XX' }).expect(400);
  });

  it('keeps historical requests visible after a leave type is deactivated', async () => {
    const { api, employee, leaveType } = await adminApi();
    const range = futureWeekdays(1, 1);
    await createBalance(employee, leaveType, range.year, 5);
    const empApi = as(await login(employee));
    await empApi.post('/api/leave-requests').send({ leaveTypeId: leaveType.id, ...{ startDate: range.startDate, endDate: range.endDate }, reason: 'Errand' }).expect(201);

    await api.patch(`/api/admin/leave-types/${leaveType.id}`).send({ isActive: false }).expect(200);
    await api.patch(`/api/admin/users/${employee.id}`).send({ isActive: true }).expect(200);

    const mine = await empApi.get('/api/leave-requests/mine');
    expect(mine.body.requests).toHaveLength(1);
    expect(mine.body.requests[0].leaveType).toMatchObject({ name: 'Casual Leave', isActive: false });

    const again = await empApi.post('/api/leave-requests').send({ leaveTypeId: leaveType.id, startDate: futureWeekdays(2, 1).startDate, endDate: futureWeekdays(2, 1).endDate, reason: 'Errand 2' });
    expect(again.status).toBe(400);
  });
});

describe('Admin: leave entitlements', () => {
  it('sets, views and updates an entitlement for an employee, type and year', async () => {
    const { api, employee, leaveType } = await adminApi();
    const created = await api.post('/api/admin/leave-balances').send({ employeeId: employee.id, leaveTypeId: leaveType.id, year: 2031, entitledDays: 15, carryForwardDays: 2 });
    expect(created.status).toBe(201);
    expect(created.body.balance).toMatchObject({ year: 2031, entitledDays: 15, carryForwardDays: 2, totalEntitled: 17, usedDays: 0, pendingDays: 0, availableDays: 17 });

    const dup = await api.post('/api/admin/leave-balances').send({ employeeId: employee.id, leaveTypeId: leaveType.id, year: 2031, entitledDays: 1 });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.id).toBe(created.body.balance.id);

    const updated = await api.patch(`/api/admin/leave-balances/${created.body.balance.id}`).send({ entitledDays: 20 });
    expect(updated.body.balance).toMatchObject({ entitledDays: 20, totalEntitled: 22 });

    const list = await api.get(`/api/admin/leave-balances?employeeId=${employee.id}&year=2031`);
    expect(list.status).toBe(200);
    expect(list.body.balances).toHaveLength(1);
    expect(list.body.balances[0]).toMatchObject({ entitledDays: 20, availableDays: 22 });
    expect(list.body.balances[0].employee.name).toBe('Employee One');
  });

  it('shows used, pending and remaining days, and blocks reducing entitlement below usage', async () => {
    const { api, employee, manager, leaveType } = await adminApi();
    const range = futureWeekdays(1, 3);
    const balance = await createBalance(employee, leaveType, range.year, 10);
    const empApi = as(await login(employee));
    const first = await empApi.post('/api/leave-requests').send({ leaveTypeId: leaveType.id, startDate: range.startDate, endDate: range.endDate, reason: 'One' }).expect(201);
    const r2 = futureWeekdays(2, 2);
    await empApi.post('/api/leave-requests').send({ leaveTypeId: leaveType.id, startDate: r2.startDate, endDate: r2.endDate, reason: 'Two' }).expect(201);
    await as(await login(manager)).patch(`/api/leave-requests/${first.body.request.id}/review`).send({ status: 'Approved' }).expect(200);

    const list = await api.get(`/api/admin/leave-balances?employeeId=${employee.id}&year=${range.year}`);
    const row = list.body.balances.find((b) => b.leaveType.id === leaveType.id);
    expect(row).toMatchObject({ totalEntitled: 10, usedDays: 3, pendingDays: 2, availableDays: 5 });

    const tooLow = await api.patch(`/api/admin/leave-balances/${balance.id}`).send({ entitledDays: 4 });
    expect(tooLow.status).toBe(422);
    await api.patch(`/api/admin/leave-balances/${balance.id}`).send({ entitledDays: 5 }).expect(200);
  });

  it('validates entitlement input', async () => {
    const { api, employee, admin, leaveType } = await adminApi();
    await api.post('/api/admin/leave-balances').send({ employeeId: employee.id, leaveTypeId: leaveType.id, year: 2031, entitledDays: -2 }).expect(400);
    await api.post('/api/admin/leave-balances').send({ employeeId: employee.id, leaveTypeId: leaveType.id, year: 1999, entitledDays: 2 }).expect(400);
    await api.post('/api/admin/leave-balances').send({ employeeId: admin.id, leaveTypeId: leaveType.id, year: 2031, entitledDays: 2 }).expect(400);
    await api.patch('/api/admin/leave-balances/64b000000000000000000000').send({ entitledDays: 2 }).expect(404);
  });

  it('applies an updated entitlement to new applications', async () => {
    const { api, employee, leaveType } = await adminApi();
    const range = futureWeekdays(1, 5);
    const balance = await createBalance(employee, leaveType, range.year, 2);
    const empApi = as(await login(employee));
    const body = { leaveTypeId: leaveType.id, startDate: range.startDate, endDate: range.endDate, reason: 'Long trip' };
    await empApi.post('/api/leave-requests').send(body).expect(422);
    await api.patch(`/api/admin/leave-balances/${balance.id}`).send({ entitledDays: 5 }).expect(200);
    await empApi.post('/api/leave-requests').send(body).expect(201);
    expect(await LeaveRequest.countDocuments()).toBe(1);
    expect((await LeaveBalance.findById(balance._id)).pendingDays).toBe(5);
  });

  it('admin dashboard returns organisation stats', async () => {
    const { api } = await adminApi();
    const res = await api.get('/api/dashboard/admin');
    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({ employees: 3, managers: 2, admins: 1, activeLeaveTypes: 1 });
  });
});
