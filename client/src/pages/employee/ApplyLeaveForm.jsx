import { useState } from 'react';
import { Field } from '../../components/ui.jsx';
import { leaveApi } from '../../api/endpoints.js';
import { useToast } from '../../context/ToastContext.jsx';
import { countWorkingDays, todayISO } from '../../utils/dates.js';
import { getErrorMessage } from '../../utils/errors.js';

const EMPTY = { leaveTypeId: '', startDate: '', endDate: '', reason: '' };

function validate(form) {
  const errors = {};
  if (!form.leaveTypeId) errors.leaveTypeId = 'Select a leave type.';
  if (!form.startDate) errors.startDate = 'Select a start date.';
  else if (form.startDate < todayISO()) errors.startDate = 'Start date cannot be in the past.';
  if (!form.endDate) errors.endDate = 'Select an end date.';
  else if (form.startDate && form.endDate < form.startDate) errors.endDate = 'End date must be on or after the start date.';
  if (form.startDate && form.endDate && form.startDate.slice(0, 4) !== form.endDate.slice(0, 4)) {
    errors.endDate = 'A request cannot span two calendar years. Split it into two requests.';
  }
  if (form.reason.trim().length < 3) errors.reason = 'Enter a reason (at least 3 characters).';
  return errors;
}

export default function ApplyLeaveForm({ leaveTypes, balances, onSubmitted }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const workingDays = countWorkingDays(form.startDate, form.endDate);
  const balance = balances.find((b) => b.leaveType?.id === form.leaveTypeId);
  const sameYearAsBalance = balance && form.startDate && Number(form.startDate.slice(0, 4)) === balance.year;
  const overBalance = sameYearAsBalance && workingDays > balance.availableDays;

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => {
      const next = { ...f, [name]: value };
      if (name === 'startDate' && (!f.endDate || f.endDate < value)) next.endDate = value;
      return next;
    });
    setErrors((errs) => ({ ...errs, [name]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      await leaveApi.apply({ ...form, reason: form.reason.trim() });
      toast.success('Leave request submitted for approval.');
      setForm(EMPTY);
      onSubmitted();
    } catch (err) {
      setServerError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!leaveTypes.length) {
    return <p className="muted">No leave types are available right now. Please contact an administrator.</p>;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="form-grid">
      {serverError && (
        <div className="alert alert-error span-all" role="alert">
          {serverError}
        </div>
      )}
      <Field label="Leave type" htmlFor="leaveTypeId" error={errors.leaveTypeId} required>
        <select id="leaveTypeId" name="leaveTypeId" value={form.leaveTypeId} onChange={onChange}>
          <option value="">Select leave type</option>
          {leaveTypes.map((t) => {
            const b = balances.find((x) => x.leaveType?.id === t.id);
            return (
              <option key={t.id} value={t.id}>
                {t.name}
                {b ? ` (${b.availableDays} available)` : ''}
              </option>
            );
          })}
        </select>
      </Field>
      <Field label="Start date" htmlFor="startDate" error={errors.startDate} required>
        <input id="startDate" name="startDate" type="date" min={todayISO()} value={form.startDate} onChange={onChange} />
      </Field>
      <Field label="End date" htmlFor="endDate" error={errors.endDate} required>
        <input id="endDate" name="endDate" type="date" min={form.startDate || todayISO()} value={form.endDate} onChange={onChange} />
      </Field>
      <div className="field">
        <span className="label-like">Working days</span>
        <div className={`days-preview ${overBalance ? 'warn' : ''}`} aria-live="polite">
          {form.startDate && form.endDate ? (
            <>
              <strong>{workingDays}</strong> day{workingDays === 1 ? '' : 's'} (Mon–Fri)
              {overBalance && <span className="block">Exceeds available balance of {balance.availableDays}.</span>}
            </>
          ) : (
            <span className="muted">Select dates</span>
          )}
        </div>
      </div>
      <Field label="Reason" htmlFor="reason" error={errors.reason} hint={`${form.reason.length}/500`} required>
        <textarea id="reason" name="reason" rows={3} maxLength={500} value={form.reason} onChange={onChange} />
      </Field>
      <div className="form-actions span-all">
        <button type="button" className="btn btn-secondary" onClick={() => { setForm(EMPTY); setErrors({}); setServerError(''); }} disabled={submitting}>
          Clear
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </form>
  );
}
