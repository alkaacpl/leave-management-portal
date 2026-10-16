import { z } from 'zod';
import { passwordSchema } from './common.js';

export const loginSchema = z.object({
  email: z.string({ required_error: 'Email is required.' }).trim().toLowerCase().email('Email address is invalid.'),
  password: z.string({ required_error: 'Password is required.' }).min(1, 'Password is required.').max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ required_error: 'Current password is required.' }).min(1, 'Current password is required.').max(128),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current password.',
  });
