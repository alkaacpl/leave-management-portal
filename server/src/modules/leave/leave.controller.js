import { currentYear } from '../../utils/dates.js';
import { getEmployeeBalances } from '../../services/balance.service.js';
import {
  applyForLeave,
  getRequestForViewer,
  listOwnRequests,
  listPendingForManager,
  listTeamRequests,
  reviewLeaveRequest,
} from '../../services/leave.service.js';

export async function myBalances(req, res) {
  const year = req.validatedQuery?.year ?? currentYear();
  res.json({ year, balances: await getEmployeeBalances(req.user._id, year) });
}

export async function create(req, res) {
  const request = await applyForLeave(req.user, req.body);
  res.status(201).json({ request });
}

export async function mine(req, res) {
  res.json({ requests: await listOwnRequests(req.user._id, req.validatedQuery) });
}

export async function pending(req, res) {
  res.json({ requests: await listPendingForManager(req.user._id) });
}

export async function team(req, res) {
  res.json({ requests: await listTeamRequests(req.user._id, req.validatedQuery) });
}

export async function getOne(req, res) {
  res.json({ request: await getRequestForViewer(req.user, req.params.id) });
}

export async function review(req, res) {
  res.json({ request: await reviewLeaveRequest(req.user, req.params.id, req.body) });
}
