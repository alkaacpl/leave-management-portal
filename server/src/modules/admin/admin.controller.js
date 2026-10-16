import { LeaveBalance, LeaveType } from '../../models/index.js';
import { createEntitlement, serializeBalance, updateEntitlement } from '../../services/balance.service.js';
import { createUser, getUser, listUsers, updateUser } from '../../services/user.service.js';
import { AppError } from '../../utils/AppError.js';

// ---- Users -------------------------------------------------------------

export async function usersIndex(req, res) {
  res.json({ users: await listUsers(req.validatedQuery) });
}

export async function usersShow(req, res) {
  res.json({ user: await getUser(req.params.id) });
}

export async function usersCreate(req, res) {
  res.status(201).json({ user: await createUser(req.body) });
}

export async function usersUpdate(req, res) {
  res.json({ user: await updateUser(req.user, req.params.id, req.body) });
}

// ---- Leave types -------------------------------------------------------

export async function leaveTypesIndex(_req, res) {
  res.json({ leaveTypes: await LeaveType.find().sort({ name: 1 }) });
}

export async function leaveTypesCreate(req, res) {
  if (await LeaveType.exists({ code: req.body.code })) {
    throw AppError.conflict(`A leave type with code ${req.body.code} already exists.`);
  }
  res.status(201).json({ leaveType: await LeaveType.create(req.body) });
}

export async function leaveTypesUpdate(req, res) {
  const leaveType = await LeaveType.findById(req.params.id);
  if (!leaveType) throw AppError.notFound('Leave type not found.');
  Object.assign(leaveType, req.body);
  await leaveType.save();
  res.json({ leaveType });
}

// ---- Leave balances / entitlements ------------------------------------

export async function balancesIndex(req, res) {
  const { employeeId, leaveTypeId, year } = req.validatedQuery;
  const filter = {};
  if (employeeId) filter.employee = employeeId;
  if (leaveTypeId) filter.leaveType = leaveTypeId;
  if (year) filter.year = year;

  const balances = await LeaveBalance.find(filter)
    .populate([{ path: 'employee', select: 'name email role isActive' }, 'leaveType'])
    .sort({ year: -1 });
  res.json({
    balances: balances
      .map(serializeBalance)
      .sort((a, b) => (a.employee?.name || '').localeCompare(b.employee?.name || '') || (a.leaveType?.name || '').localeCompare(b.leaveType?.name || '')),
  });
}

export async function balancesCreate(req, res) {
  res.status(201).json({ balance: await createEntitlement(req.body) });
}

export async function balancesUpdate(req, res) {
  res.json({ balance: await updateEntitlement(req.params.id, req.body) });
}
