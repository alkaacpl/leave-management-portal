import { Link, Navigate, Route, Routes } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { EmptyState, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import AdminOverview from '../pages/admin/AdminOverview.jsx';
import EntitlementsPage from '../pages/admin/EntitlementsPage.jsx';
import LeaveTypesPage from '../pages/admin/LeaveTypesPage.jsx';
import UsersPage from '../pages/admin/UsersPage.jsx';
import ChangePasswordPage from '../pages/auth/ChangePasswordPage.jsx';
import LoginPage from '../pages/auth/LoginPage.jsx';
import EmployeeDashboard from '../pages/employee/EmployeeDashboard.jsx';
import ManagerDashboard from '../pages/manager/ManagerDashboard.jsx';
import { homePathFor, ROLES } from '../utils/roles.js';
import ProtectedRoute from './ProtectedRoute.jsx';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

function StatusPage({ title, message }) {
  return (
    <div className="container narrow">
      <EmptyState title={title} message={message} action={<Link className="btn btn-primary" to="/">Go to my dashboard</Link>} />
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route element={<Layout />}>
          <Route element={<ProtectedRoute roles={[ROLES.EMPLOYEE, ROLES.MANAGER]} />}>
            <Route path="/employee" element={<EmployeeDashboard />} />
          </Route>
          <Route element={<ProtectedRoute roles={[ROLES.MANAGER, ROLES.ADMIN]} />}>
            <Route path="/manager" element={<ManagerDashboard />} />
          </Route>
          <Route element={<ProtectedRoute roles={[ROLES.ADMIN]} />}>
            <Route path="/admin" element={<AdminOverview />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/leave-types" element={<LeaveTypesPage />} />
            <Route path="/admin/entitlements" element={<EntitlementsPage />} />
          </Route>
          <Route path="/forbidden" element={<StatusPage title="Access denied" message="Your role does not have access to that page." />} />
          <Route path="*" element={<StatusPage title="Page not found" message="The page you are looking for does not exist." />} />
        </Route>
      </Route>
    </Routes>
  );
}
