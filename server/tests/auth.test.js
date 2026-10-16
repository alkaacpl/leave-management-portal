import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ROLES } from '../src/config/constants.js';
import { User } from '../src/models/index.js';
import { PASSWORD, app, as, createOrg, createUser, login, useTestDatabase } from './helpers.js';

useTestDatabase();

describe('Authentication', () => {
  it('logs in with valid credentials, sets an httpOnly cookie and never returns the password hash', async () => {
    const user = await createUser({ email: 'jane@test.local' });
    const res = await request(app).post('/api/auth/login').send({ email: 'JANE@test.local', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('jane@test.local');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.token).toEqual(expect.any(String));
    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/lmp_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(user.id).toBe(res.body.user.id);
  });

  it('rejects a wrong password and an unknown email with the same 401 message', async () => {
    await createUser({ email: 'jane@test.local' });
    const wrong = await request(app).post('/api/auth/login').send({ email: 'jane@test.local', password: 'nope-nope1' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@test.local', password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('validates login input', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('blocks login for deactivated accounts', async () => {
    const user = await createUser({ isActive: false });
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('returns the current user from /me using the session cookie, and logout clears it', async () => {
    const user = await createUser();
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);

    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(200);
    expect(out.headers['set-cookie'].join(';')).toMatch(/lmp_token=;/);
    await agent.get('/api/auth/me').expect(401);
  });
});

describe('Authentication protection', () => {
  it.each([
    ['get', '/api/auth/me'],
    ['get', '/api/dashboard/employee'],
    ['get', '/api/leave-balances/me'],
    ['post', '/api/leave-requests'],
    ['get', '/api/leave-requests/pending'],
    ['patch', '/api/leave-requests/000000000000000000000000/review'],
    ['get', '/api/admin/users'],
    ['post', '/api/admin/leave-types'],
  ])('%s %s requires authentication', async (method, url) => {
    const res = await request(app)[method](url).send({});
    expect(res.status).toBe(401);
  });

  it('rejects tampered or invalid tokens', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
  });

  it('rejects an existing token once the account is deactivated', async () => {
    const user = await createUser();
    const token = await login(user);
    await User.updateOne({ _id: user._id }, { isActive: false });
    await as(token).get('/api/auth/me').expect(401);
  });
});

describe('Role-based access', () => {
  it('employees cannot reach manager or admin endpoints', async () => {
    const { employee } = await createOrg();
    const api = as(await login(employee));
    await api.get('/api/dashboard/manager').expect(403);
    await api.get('/api/leave-requests/pending').expect(403);
    await api.get('/api/leave-requests/team').expect(403);
    await api.get('/api/dashboard/admin').expect(403);
    await api.get('/api/admin/users').expect(403);
    await api.post('/api/admin/leave-types').send({ name: 'Hack', code: 'HK', defaultAnnualEntitlement: 99 }).expect(403);
  });

  it('managers cannot reach admin endpoints', async () => {
    const { manager, employee, leaveType } = await createOrg();
    const api = as(await login(manager));
    await api.get('/api/admin/users').expect(403);
    await api.get('/api/dashboard/admin').expect(403);
    await api
      .post('/api/admin/leave-balances')
      .send({ employeeId: employee.id, leaveTypeId: leaveType.id, year: 2030, entitledDays: 99 })
      .expect(403);
  });

  it('employees cannot change their own role or entitlement', async () => {
    const { employee, leaveType } = await createOrg();
    const api = as(await login(employee));
    await api.patch(`/api/admin/users/${employee.id}`).send({ role: ROLES.ADMIN }).expect(403);
    await api.post('/api/admin/leave-balances').send({ employeeId: employee.id, leaveTypeId: leaveType.id, year: 2030, entitledDays: 99 }).expect(403);
    const fresh = await User.findById(employee._id);
    expect(fresh.role).toBe(ROLES.EMPLOYEE);
  });

  it('admins can reach admin endpoints but cannot apply for leave', async () => {
    const { admin, leaveType } = await createOrg();
    const api = as(await login(admin));
    await api.get('/api/dashboard/admin').expect(200);
    await api.get('/api/dashboard/employee').expect(403);
    await api.post('/api/leave-requests').send({ leaveTypeId: leaveType.id, startDate: '2099-01-05', endDate: '2099-01-05', reason: 'Test' }).expect(403);
  });

  it('returns 404 JSON for unknown API routes', async () => {
    const { employee } = await createOrg();
    const res = await as(await login(employee)).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/not found/i);
  });
});
