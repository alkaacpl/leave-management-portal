import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';
import { User } from '../../models/index.js';
import { AppError } from '../../utils/AppError.js';

const INVALID_CREDENTIALS = 'Invalid email or password.';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

async function loadProfile(userId) {
  return User.findById(userId).populate('manager', 'name email');
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');

  // Same message for unknown email and wrong password to avoid account enumeration.
  const valid = user ? await user.verifyPassword(password) : false;
  if (!user || !valid) throw AppError.unauthorized(INVALID_CREDENTIALS);
  if (!user.isActive) throw AppError.forbidden('This account has been deactivated. Please contact an administrator.');

  const token = issueSession(res, user);
  res.json({ user: await loadProfile(user._id), token });
}

function issueSession(res, user) {
  const token = signToken(user);
  const decoded = jwt.decode(token);
  res.cookie(config.cookieName, token, { ...cookieOptions(), expires: new Date(decoded.exp * 1000) });
  return token;
}

/**
 * Self-service password change. Also completes the first-login flow for accounts created
 * (or reset) by an administrator. Other sessions are signed out; this one gets a fresh token.
 */
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.verifyPassword(currentPassword))) {
    throw AppError.badRequest('Current password is incorrect.', [{ field: 'currentPassword', message: 'Current password is incorrect.' }]);
  }

  user.passwordHash = await User.hashPassword(newPassword);
  user.mustChangePassword = false;
  // Second precision matches JWT iat; tokens issued in an earlier second become invalid.
  user.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  await user.save();

  const token = issueSession(res, user);
  res.json({ user: await loadProfile(user._id), token, message: 'Password updated.' });
}

export function logout(_req, res) {
  res.clearCookie(config.cookieName, cookieOptions());
  res.json({ message: 'Signed out.' });
}

export async function me(req, res) {
  res.json({ user: await loadProfile(req.user._id) });
}
