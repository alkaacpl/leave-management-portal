import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ROLES } from '../src/config/constants.js';
import { User } from '../src/models/index.js';
import { app, as, createBalance, createLeaveType, createOrg, createUser, futureWeekdays, login, useTestDatabase } from './helpers.js';

useTestDatabase();

const TEMP_PASSWORD = 'Welcome123';
const OWN_PASSWORD = 'MyOwnPass9';

const loginRaw = (email, password) => request(app).post('/api/auth/login').send({ email, password });

/** Admin creates an account through the API; returns the created user JSON. */
async function adminCreates(adminApi, body) {
  const res = await adminApi.post('/api/admin/users').send({ password: TEMP_PASSWORD, ...body });
  expect(res.status).toBe(201);
  return res.body.user;
}

/** Complete the first-login password change; returns a fresh session token. */
async function setOwnPassword(email) {
  const first = await loginRaw(email, TEMP_PASSWORD);
  expect(first.status).toBe(200);
  const res = await as(first.body.token).post('/api/auth/change-password').send({ currentPassword: TEMP_PASSWORD, newPassword: OWN_PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token;
}

describe('Admin-created accounts and first-time sign-in', () => {
  it('creates a second manager who must set a password, then reaches the Manager Dashboard', async () => {
    const { admin, manager } = await createOrg();
    const adminApi = as(await login(admin));

    const second = await adminCreates(adminApi, { name: 'Second Manager', email: 'manager2@company.com', role: 'manager', managerId: admin.id });
    expect(second).toMatchObject({ role: 'manager', mustChangePassword: true, isActive: true });
    expect(second.passwordHash).toBeUndefined();
    expect(second.passwordChangedAt).toBeUndefined();

    // Stored as a bcrypt hash, never plain text.
    const stored = await User.findById(second.id).select('+passwordHash');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(stored.passwordHash).not.toContain(TEMP_PASSWORD);

    // First sign-in with the temporary password works but everything else is blocked.
    const first = await loginRaw('manager2@company.com', TEMP_PASSWORD);
    expect(first.status).toBe(200);
    expect(first.body.user.mustChangePassword).toBe(true);
    const temp = as(first.body.token);
    await temp.get('/api/auth/me').expect(200);
    const blocked = await temp.get('/api/dashboard/manager');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.details.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await temp.get('/api/leave-requests/pending').expect(403);

    // Set own password.
    const changed = await temp.post('/api/auth/change-password').send({ currentPassword: TEMP_PASSWORD, newPassword: OWN_PASSWORD });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    const own = as(changed.body.token);
    await own.get('/api/dashboard/manager').expect(200);

    // The temporary password no longer works; the new one does.
    await loginRaw('manager2@company.com', TEMP_PASSWORD).expect(401);
    const relog = await loginRaw('manager2@company.com', OWN_PASSWORD);
    expect(relog.status).toBe(200);
    expect(relog.body.user.role).toBe('manager');

    // Both managers coexist with distinct accounts.
    const managers = await adminApi.get('/api/admin/users?role=manager');
    expect(managers.body.users.map((u) => u.email)).toEqual(expect.arrayContaining([manager.email, 'manager2@company.com']));
  });

  it('assigns employees to the correct manager, and each manager only sees their own team', async () => {
    const { admin, manager } = await createOrg();
    const adminApi = as(await login(admin));
    const second = await adminCreates(adminApi, { name: 'Second Manager', email: 'manager2@company.com', role: 'manager' });
    const emp = await adminCreates(adminApi, { name: 'New Hire', email: 'hire@company.com', role: 'employee', managerId: second.id });
    expect(emp.manager.id).toBe(second.id);

    const leaveType = await createLeaveType();
    const range = futureWeekdays(1, 1);
    await createBalance({ _id: emp.id }, leaveType, range.year, 5);

    const empApi = as(await setOwnPassword('hire@company.com'));
    const created = await empApi.post('/api/leave-requests').send({ leaveTypeId: leaveType.id, startDate: range.startDate, endDate: range.endDate, reason: 'First leave' });
    expect(created.status).toBe(201);
    expect(created.body.request.manager.id).toBe(second.id);

    const secondApi = as(await setOwnPassword('manager2@company.com'));
    const pending = await secondApi.get('/api/leave-requests/pending');
    expect(pending.body.requests.map((r) => r.employee.email)).toEqual(['hire@company.com']);

    // The original manager cannot see or review it.
    const firstApi = as(await login(manager));
    const otherPending = await firstApi.get('/api/leave-requests/pending');
    expect(otherPending.body.requests.find((r) => r.employee.email === 'hire@company.com')).toBeUndefined();
    await firstApi.patch(`/api/leave-requests/${created.body.request.id}/review`).send({ status: 'Approved' }).expect(403);

    await secondApi.patch(`/api/leave-requests/${created.body.request.id}/review`).send({ status: 'Approved' }).expect(200);
  });

  it('rejects invalid logins', async () => {
    await createUser({ email: 'real@company.com' });
    await loginRaw('real@company.com', 'WrongPass1').expect(401);
    await loginRaw('nobody@company.com', 'WrongPass1').expect(401);
    await loginRaw('real@company.com', '').expect(400);
    await loginRaw('not-an-email', 'whatever1').expect(400);
  });

  it('forbids account creation by anyone except an administrator', async () => {
    const { manager, employee } = await createOrg();
    const body = { name: 'Sneaky', email: 'sneaky@company.com', password: 'Welcome123', role: 'admin' };

    await request(app).post('/api/admin/users').send(body).expect(401);
    await as(await login(employee)).post('/api/admin/users').send(body).expect(403);
    await as(await login(manager)).post('/api/admin/users').send({ ...body, role: 'manager' }).expect(403);
    expect(await User.exists({ email: 'sneaky@company.com' })).toBeNull();
  });

  it('has no public signup endpoint', async () => {
    for (const path of ['/api/auth/signup', '/api/auth/register', '/api/users']) {
      const res = await request(app).post(path).send({ name: 'X', email: 'x@company.com', password: 'Welcome123', role: 'admin' });
      expect([401, 404]).toContain(res.status);
    }
    expect(await User.countDocuments()).toBe(0);
  });

  it('blocks a user with a temporary password from admin routes even if they are an admin', async () => {
    const { admin } = await createOrg();
    await adminCreates(as(await login(admin)), { name: 'Admin Two', email: 'admin2@company.com', role: 'admin' });
    const temp = as((await loginRaw('admin2@company.com', TEMP_PASSWORD)).body.token);
    await temp.get('/api/admin/users').expect(403);
    await temp.post('/api/admin/users').send({ name: 'X', email: 'x@company.com', password: 'Welcome123', role: 'admin' }).expect(403);
  });
});

describe('Changing a password', () => {
  it('validates the current password and the new password policy', async () => {
    const user = await createUser({ password: 'Passw0rd!' });
    const api = as(await login(user));

    const wrong = await api.post('/api/auth/change-password').send({ currentPassword: 'nope', newPassword: OWN_PASSWORD });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toMatch(/current password is incorrect/i);

    await api.post('/api/auth/change-password').send({ currentPassword: 'Passw0rd!', newPassword: 'short1' }).expect(400);
    await api.post('/api/auth/change-password').send({ currentPassword: 'Passw0rd!', newPassword: 'nodigitshere' }).expect(400);
    await api.post('/api/auth/change-password').send({ currentPassword: 'Passw0rd!', newPassword: 'Passw0rd!' }).expect(400);
    await request(app).post('/api/auth/change-password').send({ currentPassword: 'Passw0rd!', newPassword: OWN_PASSWORD }).expect(401);
  });

  it('signs out other sessions when the password changes', async () => {
    const user = await createUser({ password: 'Passw0rd!' });
    const oldToken = await login(user);
    // Make sure the new session is issued in a later second than the old token.
    await new Promise((r) => setTimeout(r, 1100));
    const res = await as(oldToken).post('/api/auth/change-password').send({ currentPassword: 'Passw0rd!', newPassword: OWN_PASSWORD });
    expect(res.status).toBe(200);

    await as(res.body.token).get('/api/auth/me').expect(200);
    const stale = await as(oldToken).get('/api/auth/me');
    expect(stale.status).toBe(401);
    expect(stale.body.error.message).toMatch(/password was changed/i);
  });

  it('admin password reset forces a new password at next sign-in and signs the user out', async () => {
    const { admin, employee } = await createOrg();
    const empToken = await login(employee);
    await new Promise((r) => setTimeout(r, 1100));
    await as(await login(admin)).patch(`/api/admin/users/${employee.id}`).send({ password: 'Reset1234' }).expect(200);

    await as(empToken).get('/api/auth/me').expect(401);
    const relog = await loginRaw(employee.email, 'Reset1234');
    expect(relog.body.user.mustChangePassword).toBe(true);
    await as(relog.body.token).get('/api/dashboard/employee').expect(403);
  });

  it('does not let an admin reset their own password through user management', async () => {
    const { admin } = await createOrg();
    const res = await as(await login(admin)).patch(`/api/admin/users/${admin.id}`).send({ password: 'NewAdmin123' });
    expect(res.status).toBe(400);
  });

  it('cannot be used to change role or other fields', async () => {
    const user = await createUser({ password: 'Passw0rd!' });
    const res = await as(await login(user))
      .post('/api/auth/change-password')
      .send({ currentPassword: 'Passw0rd!', newPassword: OWN_PASSWORD, role: ROLES.ADMIN });
    expect(res.status).toBe(400);
    expect((await User.findById(user._id)).role).toBe(ROLES.EMPLOYEE);
  });
});
