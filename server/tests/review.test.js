import { describe, expect, it } from 'vitest';
import { LeaveBalance, LeaveRequest } from '../src/models/index.js';
import { as, createBalance, createOrg, futureWeekdays, login, useTestDatabase } from './helpers.js';

useTestDatabase();

/** Org with one pending 3-day request from `employee` against a 10-day balance. */
async function withPendingRequest() {
  const org = await createOrg();
  const range = futureWeekdays(1, 3);
  await createBalance(org.employee, org.leaveType, range.year, 10);
  const res = await as(await login(org.employee))
    .post('/api/leave-requests')
    .send({ leaveTypeId: org.leaveType.id, startDate: range.startDate, endDate: range.endDate, reason: 'Family trip' })
    .expect(201);
  const managerApi = as(await login(org.manager));
  return { ...org, range, requestId: res.body.request.id, managerApi };
}

const balanceOf = (org) => LeaveBalance.findOne({ employee: org.employee._id, leaveType: org.leaveType._id, year: org.range.year });

describe('Manager review', () => {
  it('lists pending requests of assigned employees with balance information', async () => {
    const org = await withPendingRequest();
    const res = await org.managerApi.get('/api/leave-requests/pending');
    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    const [req] = res.body.requests;
    expect(req.employee).toMatchObject({ name: 'Employee One', email: org.employee.email });
    expect(req.leaveType.name).toBe('Casual Leave');
    expect(req.days).toBe(3);
    expect(req.reason).toBe('Family trip');
    expect(req.balance).toMatchObject({ totalEntitled: 10, pendingDays: 3, availableDays: 7 });
  });

  it("does not show other teams' requests to a manager", async () => {
    const org = await withPendingRequest();
    const res = await as(await login(org.otherManager)).get('/api/leave-requests/pending');
    expect(res.body.requests).toHaveLength(0);
    const team = await as(await login(org.otherManager)).get('/api/leave-requests/team');
    expect(team.body.requests).toHaveLength(0);
  });

  it('approves a request, records the reviewer and converts the reservation to usage without double-deducting', async () => {
    const org = await withPendingRequest();
    const res = await org.managerApi.patch(`/api/leave-requests/${org.requestId}/review`).send({ status: 'Approved', remarks: 'Enjoy' });

    expect(res.status).toBe(200);
    expect(res.body.request).toMatchObject({ status: 'Approved', managerRemarks: 'Enjoy' });
    expect(res.body.request.reviewedBy.id).toBe(org.manager.id);
    expect(new Date(res.body.request.reviewedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);

    const bal = await balanceOf(org);
    expect(bal.usedDays).toBe(3);
    expect(bal.pendingDays).toBe(0);

    const mine = await as(await login(org.employee)).get(`/api/leave-balances/me?year=${org.range.year}`);
    const b = mine.body.balances.find((x) => x.leaveType.id === org.leaveType.id);
    expect(b).toMatchObject({ totalEntitled: 10, usedDays: 3, pendingDays: 0, availableDays: 7 });
  });

  it('approves without remarks', async () => {
    const org = await withPendingRequest();
    await org.managerApi.patch(`/api/leave-requests/${org.requestId}/review`).send({ status: 'Approved' }).expect(200);
  });

  it('requires remarks when rejecting', async () => {
    const org = await withPendingRequest();
    const res = await org.managerApi.patch(`/api/leave-requests/${org.requestId}/review`).send({ status: 'Rejected', remarks: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('remarks');
    expect((await LeaveRequest.findById(org.requestId)).status).toBe('Pending');
  });

  it('rejects a request with remarks and releases the reservation', async () => {
    const org = await withPendingRequest();
    const res = await org.managerApi
      .patch(`/api/leave-requests/${org.requestId}/review`)
      .send({ status: 'Rejected', remarks: 'Team release that week' });
    expect(res.status).toBe(200);
    expect(res.body.request).toMatchObject({ status: 'Rejected', managerRemarks: 'Team release that week' });

    const bal = await balanceOf(org);
    expect(bal.pendingDays).toBe(0);
    expect(bal.usedDays).toBe(0);

    // Released days and dates can be used again.
    await as(await login(org.employee))
      .post('/api/leave-requests')
      .send({ leaveTypeId: org.leaveType.id, startDate: org.range.startDate, endDate: org.range.endDate, reason: 'Second try' })
      .expect(201);
  });

  it('prevents repeat decisions on an already reviewed request', async () => {
    const org = await withPendingRequest();
    const url = `/api/leave-requests/${org.requestId}/review`;
    await org.managerApi.patch(url).send({ status: 'Approved' }).expect(200);
    const again = await org.managerApi.patch(url).send({ status: 'Rejected', remarks: 'Changed my mind' });
    expect(again.status).toBe(409);
    const bal = await balanceOf(org);
    expect(bal.usedDays).toBe(3);
  });

  it('applies exactly one decision when two reviews race', async () => {
    const org = await withPendingRequest();
    const url = `/api/leave-requests/${org.requestId}/review`;
    const results = await Promise.all([
      org.managerApi.patch(url).send({ status: 'Approved' }),
      org.managerApi.patch(url).send({ status: 'Approved' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const bal = await balanceOf(org);
    expect(bal).toMatchObject({ usedDays: 3, pendingDays: 0 });
  });

  it('forbids managers from reviewing employees not assigned to them', async () => {
    const org = await withPendingRequest();
    const res = await as(await login(org.otherManager))
      .patch(`/api/leave-requests/${org.requestId}/review`)
      .send({ status: 'Approved' });
    expect(res.status).toBe(403);
  });

  it('forbids admins who are not the assigned manager from reviewing', async () => {
    const org = await withPendingRequest();
    await as(await login(org.admin)).patch(`/api/leave-requests/${org.requestId}/review`).send({ status: 'Approved' }).expect(403);
  });

  it('forbids employees from reviewing, including their own request', async () => {
    const org = await withPendingRequest();
    await as(await login(org.employee)).patch(`/api/leave-requests/${org.requestId}/review`).send({ status: 'Approved' }).expect(403);
    await as(await login(org.employee2)).patch(`/api/leave-requests/${org.requestId}/review`).send({ status: 'Approved' }).expect(403);
  });

  it('prevents a manager from approving their own request', async () => {
    const org = await createOrg();
    const range = futureWeekdays(1, 1);
    await createBalance(org.manager, org.leaveType, range.year, 10);
    const managerApi = as(await login(org.manager));
    const created = await managerApi
      .post('/api/leave-requests')
      .send({ leaveTypeId: org.leaveType.id, startDate: range.startDate, endDate: range.endDate, reason: 'Conference' })
      .expect(201);
    const res = await managerApi.patch(`/api/leave-requests/${created.body.request.id}/review`).send({ status: 'Approved' });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/own leave request/i);

    // The manager's own manager (the admin here) can review it.
    await as(await login(org.admin)).patch(`/api/leave-requests/${created.body.request.id}/review`).send({ status: 'Approved' }).expect(200);
  });

  it('validates the review decision', async () => {
    const org = await withPendingRequest();
    await org.managerApi.patch(`/api/leave-requests/${org.requestId}/review`).send({ status: 'Maybe' }).expect(400);
    await org.managerApi.patch('/api/leave-requests/64b000000000000000000000/review').send({ status: 'Approved' }).expect(404);
  });

  it('manager dashboard summarises the team', async () => {
    const org = await withPendingRequest();
    const res = await org.managerApi.get('/api/dashboard/manager');
    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({ teamSize: 2, pendingCount: 1 });
    expect(res.body.pendingRequests).toHaveLength(1);
  });
});
