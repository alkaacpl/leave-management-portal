import { useState } from 'react';
import { adminApi } from '../../api/endpoints.js';
import Modal from '../../components/Modal.jsx';
import PasswordInput, { isStrongPassword, PasswordRules } from '../../components/PasswordInput.jsx';
import { Field } from '../../components/ui.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getErrorMessage } from '../../utils/errors.js';
import { ROLE_LABELS } from '../../utils/roles.js';

function validate(form, isEdit) {
  const errors = {};
  if (form.name.trim().length < 2) errors.name = 'Name must be at least 2 characters.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  if ((!isEdit || form.password) && !isStrongPassword(form.password)) {
    errors.password = 'Password does not meet the requirements below.';
  }
  return errors;
}

/** Create or edit a user account. `managers` are active users who can be assigned as reporting manager. */
export default function UserFormDialog({ user, managers, onClose, onSaved }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const isEdit = Boolean(user);
  const isSelf = isEdit && user.id === me.id;
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'employee',
    managerId: user?.manager?.id || '',
    department: user?.department || '',
    isActive: user?.isActive ?? true,
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  const managerOptions = managers.filter((m) => m.id !== user?.id);
  // Keep the current manager selectable even if they are no longer active, so saving other
  // fields does not silently clear the assignment.
  if (user?.manager && !managerOptions.some((m) => m.id === user.manager.id)) {
    managerOptions.push({ ...user.manager, name: `${user.manager.name} (inactive)` });
  }

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    setErrors((errs) => ({ ...errs, [name]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    const found = validate(form, isEdit);
    setErrors(found);
    if (Object.keys(found).length) return;

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      managerId: form.managerId || null,
      department: form.department.trim(),
      isActive: form.isActive,
    };
    if (form.password) payload.password = form.password;
    if (isSelf) {
      delete payload.role;
      delete payload.isActive;
    }

    setSaving(true);
    try {
      const { user: saved } = isEdit ? await adminApi.updateUser(user.id, payload) : await adminApi.createUser(payload);
      toast.success(isEdit ? `${saved.name} updated.` : `Account created for ${saved.name}.`);
      onSaved(saved);
    } catch (err) {
      setServerError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? `Edit ${user.name}` : 'Add user'}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="user-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create account'}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} noValidate className="form-grid">
        {serverError && (
          <div className="alert alert-error span-all" role="alert">
            {serverError}
          </div>
        )}
        <Field label="Full name" htmlFor="u-name" error={errors.name} required>
          <input id="u-name" name="name" value={form.name} onChange={onChange} autoComplete="off" />
        </Field>
        <Field label="Email" htmlFor="u-email" error={errors.email} required>
          <input id="u-email" name="email" type="email" value={form.email} onChange={onChange} autoComplete="off" />
        </Field>
        <Field
          label={isEdit ? 'New password' : 'Initial password'}
          htmlFor="u-password"
          error={errors.password}
          hint={
            isSelf
              ? 'Use “Change password” in the top bar to change your own password.'
              : isEdit
                ? 'Leave blank to keep the current password. A reset signs the user out and they must choose a new password at next sign-in.'
                : 'Temporary password. Share it securely; the user must choose their own password at first sign-in.'
          }
          required={!isEdit}
        >
          <PasswordInput id="u-password" name="password" value={form.password} onChange={onChange} autoComplete="new-password" disabled={isSelf} />
          {(!isEdit || form.password) && <PasswordRules password={form.password} />}
        </Field>
        <Field label="Role" htmlFor="u-role" hint={isSelf ? 'You cannot change your own role.' : undefined}>
          <select id="u-role" name="role" value={form.role} onChange={onChange} disabled={isSelf}>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reporting manager" htmlFor="u-manager" hint="Reviews this user's leave requests.">
          <select id="u-manager" name="managerId" value={form.managerId} onChange={onChange}>
            <option value="">No manager</option>
            {managerOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({ROLE_LABELS[m.role]})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Department" htmlFor="u-department">
          <input id="u-department" name="department" value={form.department} onChange={onChange} />
        </Field>
        <div className="field span-all">
          <label className="checkbox">
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={onChange} disabled={isSelf} />
            Account is active
          </label>
        </div>
      </form>
    </Modal>
  );
}
