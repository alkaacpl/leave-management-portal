export const ROLES = { EMPLOYEE: 'employee', MANAGER: 'manager', ADMIN: 'admin' };

export const ROLE_LABELS = { employee: 'Employee', manager: 'Manager', admin: 'Administrator' };

export function homePathFor(role) {
  if (role === ROLES.ADMIN) return '/admin';
  if (role === ROLES.MANAGER) return '/manager';
  return '/employee';
}

export function navLinksFor(role) {
  switch (role) {
    case ROLES.ADMIN:
      return [
        { to: '/admin', label: 'Overview', end: true },
        { to: '/admin/users', label: 'Employees' },
        { to: '/admin/leave-types', label: 'Leave Types' },
        { to: '/admin/entitlements', label: 'Entitlements' },
        { to: '/manager', label: 'Approvals' },
      ];
    case ROLES.MANAGER:
      return [
        { to: '/manager', label: 'Team Approvals' },
        { to: '/employee', label: 'My Leave' },
      ];
    default:
      return [{ to: '/employee', label: 'My Leave' }];
  }
}
