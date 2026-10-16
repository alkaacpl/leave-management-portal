import { REVIEWER_ROLES } from '../config/constants.js';
import { User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';

const MANAGER_POPULATE = { path: 'manager', select: 'name email role isActive' };

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function assertValidManager(managerId, userId) {
  if (!managerId) return null;
  if (userId && String(managerId) === String(userId)) {
    throw AppError.badRequest('A user cannot be their own manager.');
  }
  const manager = await User.findById(managerId);
  if (!manager) throw AppError.badRequest('Selected manager does not exist.');
  if (!manager.isActive) throw AppError.badRequest('Selected manager account is inactive.');
  if (!REVIEWER_ROLES.includes(manager.role)) {
    throw AppError.badRequest('Selected manager must have the manager or admin role.');
  }
  return manager;
}

/** Prevent a manager chain loop (A manages B, B manages A, ...). */
async function assertNoCycle(userId, managerId) {
  let current = managerId;
  const seen = new Set();
  while (current) {
    const key = String(current);
    if (key === String(userId)) throw AppError.badRequest('This assignment would create a circular reporting line.');
    if (seen.has(key)) break;
    seen.add(key);
    const next = await User.findById(current).select('manager');
    current = next?.manager;
  }
}

export async function listUsers({ role, active, search } = {}) {
  const filter = {};
  if (role) filter.role = role;
  if (active !== undefined) filter.isActive = active;
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: re }, { email: re }, { department: re }];
  }
  return User.find(filter).sort({ name: 1 }).populate(MANAGER_POPULATE);
}

export async function getUser(id) {
  const user = await User.findById(id).populate(MANAGER_POPULATE);
  if (!user) throw AppError.notFound('User not found.');
  return user;
}

export async function createUser({ name, email, password, role, managerId, department, isActive }) {
  await assertValidManager(managerId);
  if (await User.exists({ email })) throw AppError.conflict('A user with this email already exists.');

  const user = await User.create({
    name,
    email,
    role,
    department,
    isActive,
    manager: managerId || null,
    passwordHash: await User.hashPassword(password),
    // The administrator-chosen password is temporary; the user sets their own at first sign-in.
    mustChangePassword: true,
  });
  await user.populate(MANAGER_POPULATE);
  return user;
}

export async function updateUser(actor, id, changes) {
  const user = await User.findById(id);
  if (!user) throw AppError.notFound('User not found.');

  const isSelf = user._id.equals(actor._id);
  if (isSelf && changes.role !== undefined && changes.role !== user.role) {
    throw AppError.forbidden('You cannot change your own role.');
  }
  if (isSelf && changes.isActive === false) {
    throw AppError.forbidden('You cannot deactivate your own account.');
  }
  if (isSelf && changes.password) {
    throw AppError.badRequest('Use "Change password" to update your own password.');
  }

  if (changes.email && changes.email !== user.email && (await User.exists({ email: changes.email, _id: { $ne: user._id } }))) {
    throw AppError.conflict('A user with this email already exists.');
  }

  const losesReviewerRole = changes.role && !REVIEWER_ROLES.includes(changes.role) && REVIEWER_ROLES.includes(user.role);
  const deactivating = changes.isActive === false && user.isActive;
  if (losesReviewerRole || deactivating) {
    const reports = await User.countDocuments({ manager: user._id, isActive: true });
    if (reports > 0) {
      throw AppError.conflict(
        `This user manages ${reports} active employee(s). Reassign them to another manager first.`,
      );
    }
  }

  if (changes.managerId !== undefined) {
    if (changes.managerId) {
      await assertValidManager(changes.managerId, user._id);
      await assertNoCycle(user._id, changes.managerId);
    }
    user.manager = changes.managerId || null;
  }

  for (const field of ['name', 'email', 'role', 'department', 'isActive']) {
    if (changes[field] !== undefined) user[field] = changes[field];
  }
  if (changes.password) {
    // Admin reset: temporary password, existing sessions signed out, new password required at next sign-in.
    user.passwordHash = await User.hashPassword(changes.password);
    user.mustChangePassword = true;
    user.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  }

  await user.save();
  await user.populate(MANAGER_POPULATE);
  return user;
}
