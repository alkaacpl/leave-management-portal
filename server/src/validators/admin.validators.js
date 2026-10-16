import { z } from 'zod';
import { ROLE_VALUES } from '../config/constants.js';
import { booleanQuery, daysSchema, objectId, passwordSchema, yearSchema } from './common.js';

const name = z.string().trim().min(2, 'Name must be at least 2 characters.').max(100);
const email = z.string().trim().toLowerCase().email('Email address is invalid.').max(254);
const password = passwordSchema;
const role = z.enum(ROLE_VALUES, { errorMap: () => ({ message: `Role must be one of: ${ROLE_VALUES.join(', ')}.` }) });
const managerId = objectId('Manager').nullable();
const department = z.string().trim().max(100);

export const createUserSchema = z
  .object({
    name,
    email,
    password,
    role,
    managerId: managerId.optional().default(null),
    department: department.optional().default(''),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const updateUserSchema = z
  .object({
    name: name.optional(),
    email: email.optional(),
    password: password.optional(),
    role: role.optional(),
    managerId: managerId.optional(),
    department: department.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update.');

export const listUsersQuerySchema = z.object({
  role: z.enum(ROLE_VALUES).optional(),
  active: booleanQuery,
  search: z.string().trim().max(100).optional(),
});

const leaveTypeName = z.string().trim().min(2, 'Name must be at least 2 characters.').max(60);
const description = z.string().trim().max(500);

export const createLeaveTypeSchema = z
  .object({
    name: leaveTypeName,
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_]{2,10}$/, 'Code must be 2-10 letters, digits or underscores.'),
    description: description.optional().default(''),
    defaultAnnualEntitlement: daysSchema('Default annual entitlement'),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const updateLeaveTypeSchema = z
  .object({
    name: leaveTypeName.optional(),
    description: description.optional(),
    defaultAnnualEntitlement: daysSchema('Default annual entitlement').optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update.');

export const createBalanceSchema = z
  .object({
    employeeId: objectId('Employee'),
    leaveTypeId: objectId('Leave type'),
    year: yearSchema,
    entitledDays: daysSchema('Entitled days'),
    carryForwardDays: daysSchema('Carry-forward days').optional().default(0),
  })
  .strict();

export const updateBalanceSchema = z
  .object({
    entitledDays: daysSchema('Entitled days').optional(),
    carryForwardDays: daysSchema('Carry-forward days').optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide entitledDays or carryForwardDays.');

export const listBalancesQuerySchema = z.object({
  employeeId: objectId('Employee').optional(),
  leaveTypeId: objectId('Leave type').optional(),
  year: yearSchema.optional(),
});
