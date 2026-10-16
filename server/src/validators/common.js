import mongoose from 'mongoose';
import { z } from 'zod';

export const objectId = (label = 'id') =>
  z.string({ required_error: `${label} is required.` }).refine((v) => mongoose.isValidObjectId(v), {
    message: `${label} is not a valid identifier.`,
  });

export const idParams = z.object({ id: objectId('id') });

export const dateOnly = (label) =>
  z
    .string({ required_error: `${label} is required.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be in YYYY-MM-DD format.`);

export const yearSchema = z.coerce.number().int().min(2000).max(2100);

export const daysSchema = (label) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number.` })
    .min(0, `${label} cannot be negative.`)
    .max(365, `${label} cannot exceed 365.`)
    .refine((v) => Number.isInteger(v * 2), `${label} must be a whole or half day.`);

/** Password policy shared by account creation, admin reset and self-service change. */
export const passwordSchema = z
  .string({ required_error: 'Password is required.' })
  .min(8, 'Password must be at least 8 characters.')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter.')
  .regex(/\d/, 'Password must contain a number.');

export const booleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();
