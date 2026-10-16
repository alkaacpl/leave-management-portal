import { api } from './client.js';

const data = (promise) => promise.then((res) => res.data);

export const authApi = {
  login: (email, password) => data(api.post('/auth/login', { email, password })),
  logout: () => data(api.post('/auth/logout')),
  me: () => data(api.get('/auth/me')),
  changePassword: (currentPassword, newPassword) => data(api.post('/auth/change-password', { currentPassword, newPassword })),
};

export const dashboardApi = {
  employee: () => data(api.get('/dashboard/employee')),
  manager: () => data(api.get('/dashboard/manager')),
  admin: () => data(api.get('/dashboard/admin')),
};

export const leaveApi = {
  myBalances: (year) => data(api.get('/leave-balances/me', { params: { year } })),
  apply: (payload) => data(api.post('/leave-requests', payload)),
  mine: (params) => data(api.get('/leave-requests/mine', { params })),
  get: (id) => data(api.get(`/leave-requests/${id}`)),
  pending: () => data(api.get('/leave-requests/pending')),
  team: (params) => data(api.get('/leave-requests/team', { params })),
  review: (id, payload) => data(api.patch(`/leave-requests/${id}/review`, payload)),
};

export const adminApi = {
  users: (params) => data(api.get('/admin/users', { params })),
  user: (id) => data(api.get(`/admin/users/${id}`)),
  createUser: (payload) => data(api.post('/admin/users', payload)),
  updateUser: (id, payload) => data(api.patch(`/admin/users/${id}`, payload)),

  leaveTypes: () => data(api.get('/admin/leave-types')),
  createLeaveType: (payload) => data(api.post('/admin/leave-types', payload)),
  updateLeaveType: (id, payload) => data(api.patch(`/admin/leave-types/${id}`, payload)),

  balances: (params) => data(api.get('/admin/leave-balances', { params })),
  createBalance: (payload) => data(api.post('/admin/leave-balances', payload)),
  updateBalance: (id, payload) => data(api.patch(`/admin/leave-balances/${id}`, payload)),
};
