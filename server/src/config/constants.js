export const ROLES = Object.freeze({
  EMPLOYEE: 'employee',
  MANAGER: 'manager',
  ADMIN: 'admin',
});

export const ROLE_VALUES = Object.values(ROLES);

/** Roles that may be assigned as someone's reporting manager (and therefore review leave). */
export const REVIEWER_ROLES = [ROLES.MANAGER, ROLES.ADMIN];

/** Roles that hold leave balances and may apply for leave. */
export const LEAVE_APPLICANT_ROLES = [ROLES.EMPLOYEE, ROLES.MANAGER];

export const LEAVE_STATUS = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

export const LEAVE_STATUS_VALUES = Object.values(LEAVE_STATUS);

/** Statuses that occupy calendar dates and leave balance. */
export const ACTIVE_LEAVE_STATUSES = [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED];
