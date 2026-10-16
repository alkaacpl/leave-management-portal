import { useState } from 'react';
import { adminApi } from '../../api/endpoints.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import Modal from '../../components/Modal.jsx';
import { ActiveBadge, Card, EmptyState, ErrorBanner, Field, PageHeader, Spinner } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { getErrorMessage } from '../../utils/errors.js';

function LeaveTypeForm({ leaveType, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(leaveType);
  const [form, setForm] = useState({
    name: leaveType?.name || '',
    code: leaveType?.code || '',
    description: leaveType?.description || '',
    defaultAnnualEntitlement: leaveType?.defaultAnnualEntitlement ?? '',
    isActive: leaveType?.isActive ?? true,
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    setErrors((errs) => ({ ...errs, [name]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    const found = {};
    if (form.name.trim().length < 2) found.name = 'Name must be at least 2 characters.';
    if (!isEdit && !/^[A-Za-z0-9_]{2,10}$/.test(form.code.trim())) found.code = '2-10 letters, digits or underscores.';
    const days = Number(form.defaultAnnualEntitlement);
    if (form.defaultAnnualEntitlement === '' || Number.isNaN(days) || days < 0 || days > 365) found.defaultAnnualEntitlement = 'Enter a number between 0 and 365.';
    setErrors(found);
    if (Object.keys(found).length) return;

    const payload = { name: form.name.trim(), description: form.description.trim(), defaultAnnualEntitlement: days, isActive: form.isActive };
    setSaving(true);
    try {
      const { leaveType: saved } = isEdit
        ? await adminApi.updateLeaveType(leaveType.id, payload)
        : await adminApi.createLeaveType({ ...payload, code: form.code.trim().toUpperCase() });
      toast.success(`${saved.name} ${isEdit ? 'updated' : 'created'}.`);
      onSaved();
    } catch (err) {
      setServerError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? `Edit ${leaveType.name}` : 'Add leave type'}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="leave-type-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create leave type'}
          </button>
        </>
      }
    >
      <form id="leave-type-form" onSubmit={onSubmit} noValidate className="form-grid">
        {serverError && (
          <div className="alert alert-error span-all" role="alert">
            {serverError}
          </div>
        )}
        <Field label="Name" htmlFor="lt-name" error={errors.name} required>
          <input id="lt-name" name="name" value={form.name} onChange={onChange} />
        </Field>
        <Field label="Code" htmlFor="lt-code" error={errors.code} hint={isEdit ? 'Codes cannot be changed.' : 'e.g. CL'} required={!isEdit}>
          <input id="lt-code" name="code" value={form.code} onChange={onChange} disabled={isEdit} maxLength={10} />
        </Field>
        <Field label="Default annual entitlement (days)" htmlFor="lt-days" error={errors.defaultAnnualEntitlement} hint="Used when no specific entitlement is set." required>
          <input id="lt-days" name="defaultAnnualEntitlement" type="number" min="0" max="365" step="0.5" value={form.defaultAnnualEntitlement} onChange={onChange} />
        </Field>
        <div className="field">
          <span className="label-like">Availability</span>
          <label className="checkbox">
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={onChange} />
            Employees can apply for this leave type
          </label>
        </div>
        <Field label="Description" htmlFor="lt-desc" hint={`${form.description.length}/500`}>
          <textarea id="lt-desc" name="description" rows={3} maxLength={500} value={form.description} onChange={onChange} />
        </Field>
      </form>
    </Modal>
  );
}

export default function LeaveTypesPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => adminApi.leaveTypes(), []);
  const [editing, setEditing] = useState(null);
  const [toggling, setToggling] = useState(null);

  const toggle = async () => {
    const target = toggling;
    try {
      await adminApi.updateLeaveType(target.id, { isActive: !target.isActive });
      toast.success(`${target.name} ${target.isActive ? 'deactivated' : 'activated'}.`);
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setToggling(null);
    }
  };

  const columns = [
    { key: 'name', header: 'Name', render: (t) => <span className="person-name">{t.name}</span> },
    { key: 'code', header: 'Code', render: (t) => <span className="badge badge-neutral">{t.code}</span> },
    { key: 'desc', header: 'Description', render: (t) => (t.description ? <span className="clamp">{t.description}</span> : <span className="muted">—</span>) },
    { key: 'days', header: 'Default days / year', render: (t) => t.defaultAnnualEntitlement, className: 'num' },
    { key: 'status', header: 'Status', render: (t) => <ActiveBadge active={t.isActive} /> },
    {
      key: 'actions',
      header: 'Actions',
      className: 'actions',
      render: (t) => (
        <div className="btn-row">
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditing(t)}>
            Edit
          </button>
          <button type="button" className={`btn btn-sm ${t.isActive ? 'btn-danger-outline' : 'btn-success'}`} onClick={() => setToggling(t)}>
            {t.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Leave Types"
        subtitle="Configure the kinds of leave employees can request."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            Add leave type
          </button>
        }
      />
      <Card>
        <ErrorBanner message={error} onRetry={reload} />
        {loading && !data ? (
          <Spinner />
        ) : (
          <DataTable caption="Leave types" columns={columns} rows={data?.leaveTypes || []} empty={<EmptyState title="No leave types" message="Add a leave type to get started." />} />
        )}
      </Card>

      {editing && (
        <LeaveTypeForm
          leaveType={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {toggling && (
        <ConfirmDialog
          title={toggling.isActive ? 'Deactivate leave type' : 'Activate leave type'}
          message={
            toggling.isActive
              ? `Employees will no longer be able to apply for ${toggling.name}. Existing requests and balances are kept.`
              : `Employees will be able to apply for ${toggling.name} again.`
          }
          confirmLabel={toggling.isActive ? 'Deactivate' : 'Activate'}
          tone={toggling.isActive ? 'danger' : 'success'}
          onConfirm={toggle}
          onCancel={() => setToggling(null)}
        />
      )}
    </>
  );
}
