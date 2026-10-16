import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/icons.jsx';
import PasswordInput, { isStrongPassword, PasswordRules } from '../../components/PasswordInput.jsx';
import { Field } from '../../components/ui.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getErrorMessage } from '../../utils/errors.js';
import { homePathFor } from '../../utils/roles.js';

/**
 * Used both for the required first-time password setup (temporary password issued by an
 * administrator) and for a voluntary password change.
 */
export default function ChangePasswordPage() {
  const { user, changePassword, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const firstTime = Boolean(user?.mustChangePassword);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  const onChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((errs) => ({ ...errs, [e.target.name]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    const found = {};
    if (!form.currentPassword) found.currentPassword = firstTime ? 'Enter the temporary password you received.' : 'Enter your current password.';
    if (!isStrongPassword(form.newPassword)) found.newPassword = 'Password does not meet the requirements.';
    else if (form.newPassword === form.currentPassword) found.newPassword = 'Choose a password different from the current one.';
    if (form.confirmPassword !== form.newPassword) found.confirmPassword = 'Passwords do not match.';
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const updated = await changePassword(form.currentPassword, form.newPassword);
      toast.success('Your password has been updated.');
      navigate(homePathFor(updated.role), { replace: true });
    } catch (err) {
      setServerError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="login-page single">
      <div className="login-card card">
        <div className="login-brand">
          <span className="hero-mark small-mark">
            <Icon name="shield" size={24} />
          </span>
          <div>
            <h1>{firstTime ? 'Set your password' : 'Change password'}</h1>
            <p className="muted">
              {firstTime
                ? `Welcome, ${user.name}. Your account was created by an administrator with a temporary password. Choose your own password to continue.`
                : 'Other devices signed in to your account will be signed out.'}
            </p>
          </div>
        </div>
        <form onSubmit={onSubmit} noValidate>
          {serverError && (
            <div className="alert alert-error" role="alert">
              {serverError}
            </div>
          )}
          <Field label={firstTime ? 'Temporary password' : 'Current password'} htmlFor="currentPassword" error={errors.currentPassword} required>
            <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" value={form.currentPassword} onChange={onChange} />
          </Field>
          <Field label="New password" htmlFor="newPassword" error={errors.newPassword} required>
            <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" value={form.newPassword} onChange={onChange} />
            <PasswordRules password={form.newPassword} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword} required>
            <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" value={form.confirmPassword} onChange={onChange} />
          </Field>
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving…' : firstTime ? 'Set password and continue' : 'Update password'}
          </button>
          {firstTime ? (
            <button type="button" className="btn btn-secondary btn-block" onClick={signOut} disabled={saving}>
              Sign out
            </button>
          ) : (
            <Link to={homePathFor(user.role)} className="btn btn-secondary btn-block">
              Back to dashboard
            </Link>
          )}
        </form>
      </div>
    </div>
  );
}
