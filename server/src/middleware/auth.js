import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';

function extractToken(req) {
  const header = req.get('authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[config.cookieName] || null;
}

/**
 * Verifies the JWT and reloads the user from the database on every request, so that
 * role changes and deactivations take effect immediately rather than when the token expires.
 */
export async function authenticate(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next(AppError.unauthorized());

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(AppError.unauthorized('Session is invalid or has expired. Please sign in again.'));
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    return next(AppError.unauthorized('Account is inactive or no longer exists.'));
  }
  // JWT iat is in seconds; reject tokens issued before the last password change.
  if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    return next(AppError.unauthorized('Your password was changed. Please sign in again.'));
  }
  req.user = user;
  return next();
}

/**
 * Block everything except the password-change endpoints until a user with a temporary
 * (administrator-issued) password has chosen their own. Enforced server-side for every route.
 */
export function requirePasswordSet(req, _res, next) {
  if (req.user?.mustChangePassword) {
    return next(
      new AppError(403, 'You must set a new password before continuing.', { code: 'PASSWORD_CHANGE_REQUIRED' }),
    );
  }
  return next();
}

/** Restrict a route to the given roles. Must run after authenticate. */
export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    return next();
  };
}
