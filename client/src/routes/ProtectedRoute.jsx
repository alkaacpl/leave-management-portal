import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Guards routes on the client for navigation purposes only.
 * The API enforces authentication and roles independently on every request.
 */
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Accounts with an administrator-issued temporary password must set their own first.
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}
