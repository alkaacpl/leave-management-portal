import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../../components/icons.jsx';
import PasswordInput from '../../components/PasswordInput.jsx';
import { Field, Spinner } from '../../components/ui.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getErrorMessage } from '../../utils/errors.js';
import { homePathFor } from '../../utils/roles.js';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <Spinner label="Checking your session…" />;
  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email.trim() || !form.password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      const signedIn = await login(form.email.trim(), form.password);
      toast.success(`Welcome, ${signedIn.name}.`);
      const from = location.state?.from;
      navigate(from && from !== '/login' ? from : homePathFor(signedIn.role), { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-hero" aria-hidden="true">
        <div className="login-hero-inner">
          <span className="hero-mark">
            <Icon name="calendar" size={28} />
          </span>
          <h2>Plan time off without the paperwork.</h2>
          <p>Apply for leave, track balances and approve requests in one place.</p>
          <ul className="hero-points">
            <li>
              <Icon name="wallet" size={18} /> Live leave balances
            </li>
            <li>
              <Icon name="check" size={18} /> One-click manager approvals
            </li>
            <li>
              <Icon name="shield" size={18} /> Role-based secure access
            </li>
          </ul>
        </div>
      </aside>
      <div className="login-card card">
        <div className="login-brand">
          <img src="/favicon.svg" alt="" width="40" height="40" />
          <div>
            <h1>Leave Management Portal</h1>
            <p className="muted">Sign in to apply for and manage leave.</p>
          </div>
        </div>
        <form onSubmit={onSubmit} noValidate>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <Field label="Email" htmlFor="email" required>
            <input id="email" name="email" type="email" autoComplete="username" value={form.email} onChange={onChange} required />
          </Field>
          <Field label="Password" htmlFor="password" required>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              value={form.password}
              onChange={onChange}
              required
            />
          </Field>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="login-note">
          <strong>No account yet?</strong> Accounts are created by your administrator; there is no public sign-up. You will receive
          your email and a temporary password, and you will be asked to choose your own password the first time you sign in.
        </div>
      </div>
    </div>
  );
}
