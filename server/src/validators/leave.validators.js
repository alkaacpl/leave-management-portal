import { z } from 'zod';
import { LEAVE_STATUS, LEAVE_STATUS_VALUES } from '../config/constants.js';
import { dateOnly, objectId, yearSchema } from './common.js';

export const applyLeaveSchema = z
  .object({
    leaveTypeId: objectId('Leave type'),
    startDate: dateOnly('Start date'),
    endDate: dateOnly('End date'),
    reason: z
      .string({ required_error: 'Reason is required.' })
      .trim()
      .min(3, 'Reason must be at least 3 characters.')
      .max(500, 'Reason cannot exceed 500 characters.'),
  })
  .strict();

export const reviewLeaveSchema = z
  .object({
    status: z.enum([LEAVE_STATUS.APPROVED, LEAVE_STATUS.REJECTED], {
      errorMap: () => ({ message: 'Status must be "Approved" or "Rejected".' }),
    }),
    remarks: z.string().trim().max(500, 'Remarks cannot exceed 500 characters.').optional().default(''),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === LEAVE_STATUS.REJECTED && !value.remarks) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['remarks'], message: 'A reason is required when rejecting a request.' });
    }
  });

export const listLeaveQuerySchema = z.object({
  status: z.enum(LEAVE_STATUS_VALUES).optional(),
  year: yearSchema.optional(),
});

export const balanceQuerySchema = z.object({
  year: yearSchema.optional(),
});
