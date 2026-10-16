import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaveBalance, LeaveRequest } from '../src/models/index.js';
import { setTransportForTesting, waitForPendingEmails } from '../src/services/email/email.service.js';
import { escapeHtml, leaveReviewedEmployee } from '../src/services/email/templates.js';
import { ROLES } from '../src/config/constants.js';
import { as, createBalance, createLeaveType, createUser, futureWeekdays, login, useTestDatabase } from './helpers.js';

useTestDatabase();

let transport;
beforeEach(() => {
  transport = { sendMail: vi.fn(async (msg) => ({ messageId: `<${Math.random()}@mock>`, accepted: [msg.to], rejected: [] })) };
  setTransportForTesting(transport);
});
afterEach(async () => {
  await waitForPendingEmails();
  setTransportForTesting(null);
});

/** Org with deliverable (non-reserved-domain) addresses so emails are not skipped. */
async function setup() {
  const manager = await createUser({ role: ROLES.MANAGER, name: 'Mona Manager', email: 'mona@company.com' });
  const employee = await createUser({ name: 'Eli Employee', email: 'eli@company.com', manager: manager._id });
  const leaveType = await createLeaveType({ name: 'Casual Leave', code: 'CL' });
  const range = futureWeekdays(1, 2);
  await createBalance(employee, leaveType, range.year, 10);
  return { manager, employee, leaveType, range, empApi: as(await login(employee)), mgrApi: as(await login(manager)) };
}

const apply = (ctx, reason = 'Family <wedding> & travel') =>
  ctx.empApi.post('/api/leave-requests').send({ leaveTypeId: ctx.leaveType.id, startDate: ctx.range.startDate, endDate: ctx.range.endDate, reason });

const sent = () => transport.sendMail.mock.calls.map(([msg]) => msg);

describe('Email notifications', () => {
  it('sends a confirmation to the employee and a notification to the manager after submission', async () => {
    const ctx = await setup();
    await apply(ctx).expect(201);
    await waitForPendingEmails();

    const messages = sent();
    expect(messages).toHaveLength(2);
    const toEmployee = messages.find((m) => m.to === 'eli@company.com');
    const toManager = messages.find((m) => m.to === 'mona@company.com');
    expect(toEmployee.subject).toMatch(/submitted/i);
    expect(toManager.subject).toMatch(/action required.*Eli Employee/i);
    for (const m of messages) {
      expect(m.html).toContain('<!doctype html>');
      expect(m.text).toMatch(/Casual Leave/);
      // User input is escaped in HTML and kept as-is in the text part.
      expect(m.html).toContain('Family &lt;wedding&gt; &amp; travel');
      expect(m.html).not.toContain('<wedding>');
      expect(m.text).toContain('Family <wedding> & travel');
    }
  });

  it('notifies the employee on approval', async () => {
    const ctx = await setup();
    const { body } = await apply(ctx).expect(201);
    await waitForPendingEmails();
    transport.sendMail.mockClear();

    await ctx.mgrApi.patch(`/api/leave-requests/${body.request.id}/review`).send({ status: 'Approved', remarks: 'Enjoy!' }).expect(200);
    await waitForPendingEmails();

    const [msg] = sent();
    expect(sent()).toHaveLength(1);
    expect(msg.to).toBe('eli@company.com');
    expect(msg.subject).toMatch(/approved/i);
    expect(msg.text).toMatch(/Decision: Approved/);
    expect(msg.text).toMatch(/Reviewed by: Mona Manager/);
  });

  it("notifies the employee on rejection, including the manager's remarks", async () => {
    const ctx = await setup();
    const { body } = await apply(ctx).expect(201);
    await waitForPendingEmails();
    transport.sendMail.mockClear();

    await ctx.mgrApi
      .patch(`/api/leave-requests/${body.request.id}/review`)
      .send({ status: 'Rejected', remarks: 'Quarter-end <freeze>' })
      .expect(200);
    await waitForPendingEmails();

    const [msg] = sent();
    expect(msg.to).toBe('eli@company.com');
    expect(msg.subject).toMatch(/rejected/i);
    expect(msg.text).toContain('Reason for rejection: Quarter-end <freeze>');
    expect(msg.html).toContain('Quarter-end &lt;freeze&gt;');
  });

  it('sends nothing when the database operation fails validation', async () => {
    const ctx = await setup();
    await ctx.empApi.post('/api/leave-requests').send({ leaveTypeId: ctx.leaveType.id, startDate: '2020-01-06', endDate: '2020-01-06', reason: 'Past' }).expect(400);
    await ctx.mgrApi.patch('/api/leave-requests/64b000000000000000000000/review').send({ status: 'Approved' }).expect(404);
    await waitForPendingEmails();
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('keeps the saved request and review when SMTP fails', async () => {
    const ctx = await setup();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    transport.sendMail.mockRejectedValue(Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 }));

    const { body } = await apply(ctx).expect(201);
    await waitForPendingEmails();
    expect(await LeaveRequest.countDocuments()).toBe(1);
    expect((await LeaveBalance.findOne({ employee: ctx.employee._id })).pendingDays).toBe(2);

    await ctx.mgrApi.patch(`/api/leave-requests/${body.request.id}/review`).send({ status: 'Approved' }).expect(200);
    await waitForPendingEmails();
    const saved = await LeaveRequest.findById(body.request.id);
    expect(saved.status).toBe('Approved');
    expect((await LeaveBalance.findOne({ employee: ctx.employee._id })).usedDays).toBe(2);

    // Failures are logged without secrets.
    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).toMatch(/EAUTH/);
    if (process.env.SMTP_PASS) expect(logged).not.toContain(process.env.SMTP_PASS.replace(/\s+/g, ''));
    errorSpy.mockRestore();
  });

  it('skips reserved, non-deliverable domains such as the seeded .local accounts', async () => {
    const manager = await createUser({ role: ROLES.MANAGER, email: 'boss@leaveportal.local' });
    const employee = await createUser({ email: 'worker@leaveportal.local', manager: manager._id });
    const leaveType = await createLeaveType();
    const range = futureWeekdays(1, 1);
    await createBalance(employee, leaveType, range.year, 5);
    await as(await login(employee)).post('/api/leave-requests').send({ leaveTypeId: leaveType.id, ...{ startDate: range.startDate, endDate: range.endDate }, reason: 'Errand' }).expect(201);
    await waitForPendingEmails();
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('never exposes SMTP settings through the API', async () => {
    const ctx = await setup();
    const responses = await Promise.all([
      apply(ctx),
      ctx.empApi.get('/api/auth/me'),
      ctx.empApi.get('/api/dashboard/employee'),
      ctx.mgrApi.get('/api/dashboard/manager'),
    ]);
    const blob = responses.map((r) => JSON.stringify(r.body)).join(' ');
    expect(blob).not.toMatch(/smtp/i);
    for (const key of ['SMTP_PASS', 'SMTP_USER']) {
      const value = process.env[key];
      if (value) expect(blob).not.toContain(value);
    }
  });
});

describe('Email templates', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('shows a placeholder when a rejection has no remarks', () => {
    const msg = leaveReviewedEmployee({
      status: 'Rejected',
      employee: { name: 'A', email: 'a@company.com' },
      reviewedBy: { name: 'B' },
      leaveType: { name: 'Sick Leave' },
      startDate: new Date('2030-01-07T00:00:00Z'),
      endDate: new Date('2030-01-08T00:00:00Z'),
      days: 2,
      reason: 'Flu',
      managerRemarks: '',
    });
    expect(msg.text).toContain('7 Jan 2030 to 8 Jan 2030');
    expect(msg.text).toContain('Reason for rejection: —');
  });
});
