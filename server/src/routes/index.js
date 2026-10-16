import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { LEAVE_APPLICANT_ROLES, REVIEWER_ROLES, ROLES } from '../config/constants.js';
import { config } from '../config/env.js';
import { authenticate, authorize, requirePasswordSet } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as admin from '../modules/admin/admin.controller.js';
import * as auth from '../modules/auth/auth.controller.js';
import * as dashboard from '../modules/dashboard/dashboard.controller.js';
import * as leave from '../modules/leave/leave.controller.js';
import {
  createBalanceSchema,
  createLeaveTypeSchema,
  createUserSchema,
  listBalancesQuerySchema,
  listUsersQuerySchema,
  updateBalanceSchema,
  updateLeaveTypeSchema,
  updateUserSchema,
} from '../validators/admin.validators.js';
import { changePasswordSchema, loginSchema } from '../validators/auth.validators.js';
import { idParams } from '../validators/common.js';
import {
  applyLeaveSchema,
  balanceQuerySchema,
  listLeaveQuerySchema,
  reviewLeaveSchema,
} from '../validators/leave.validators.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.loginRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { error: { message: 'Too many login attempts. Please try again in 15 minutes.' } },
});

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ---- Authentication ----------------------------------------------------
router.post('/auth/login', loginLimiter, validate({ body: loginSchema }), auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', authenticate, auth.me);
router.post('/auth/change-password', authenticate, validate({ body: changePasswordSchema }), auth.changePassword);

// Every route below requires a valid session and a user-chosen (non-temporary) password.
router.use(authenticate, requirePasswordSet);

// ---- Dashboards --------------------------------------------------------
router.get('/dashboard/employee', authorize(...LEAVE_APPLICANT_ROLES), dashboard.employeeDashboard);
router.get('/dashboard/manager', authorize(...REVIEWER_ROLES), dashboard.managerDashboard);
router.get('/dashboard/admin', authorize(ROLES.ADMIN), dashboard.adminDashboard);

// ---- Employee leave ----------------------------------------------------
router.get('/leave-balances/me', authorize(...LEAVE_APPLICANT_ROLES), validate({ query: balanceQuerySchema }), leave.myBalances);
router.post('/leave-requests', authorize(...LEAVE_APPLICANT_ROLES), validate({ body: applyLeaveSchema }), leave.create);
router.get('/leave-requests/mine', authorize(...LEAVE_APPLICANT_ROLES), validate({ query: listLeaveQuerySchema }), leave.mine);

// ---- Manager review ----------------------------------------------------
router.get('/leave-requests/pending', authorize(...REVIEWER_ROLES), leave.pending);
router.get('/leave-requests/team', authorize(...REVIEWER_ROLES), validate({ query: listLeaveQuerySchema }), leave.team);
router.patch(
  '/leave-requests/:id/review',
  authorize(...REVIEWER_ROLES),
  validate({ params: idParams, body: reviewLeaveSchema }),
  leave.review,
);

// Any signed-in user; ownership/assignment is checked in the service.
router.get('/leave-requests/:id', validate({ params: idParams }), leave.getOne);

// ---- Administration ----------------------------------------------------
const adminOnly = authorize(ROLES.ADMIN);
router.get('/admin/users', adminOnly, validate({ query: listUsersQuerySchema }), admin.usersIndex);
router.post('/admin/users', adminOnly, validate({ body: createUserSchema }), admin.usersCreate);
router.get('/admin/users/:id', adminOnly, validate({ params: idParams }), admin.usersShow);
router.patch('/admin/users/:id', adminOnly, validate({ params: idParams, body: updateUserSchema }), admin.usersUpdate);

router.get('/admin/leave-types', adminOnly, admin.leaveTypesIndex);
router.post('/admin/leave-types', adminOnly, validate({ body: createLeaveTypeSchema }), admin.leaveTypesCreate);
router.patch('/admin/leave-types/:id', adminOnly, validate({ params: idParams, body: updateLeaveTypeSchema }), admin.leaveTypesUpdate);

router.get('/admin/leave-balances', adminOnly, validate({ query: listBalancesQuerySchema }), admin.balancesIndex);
router.post('/admin/leave-balances', adminOnly, validate({ body: createBalanceSchema }), admin.balancesCreate);
router.patch(
  '/admin/leave-balances/:id',
  adminOnly,
  validate({ params: idParams, body: updateBalanceSchema }),
  admin.balancesUpdate,
);

export default router;
