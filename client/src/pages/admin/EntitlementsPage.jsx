import { useMemo, useState } from 'react';
import { adminApi } from '../../api/endpoints.js';
import DataTable from '../../components/DataTable.jsx';
import { ActiveBadge, Card, EmptyState, ErrorBanner, Field, PageHeader, Spinner } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { getErrorMessage } from '../../utils/errors.js';
import { ROLE_LABELS } from '../../utils/roles.js';

const THIS_YEAR = new Date().getFullYear();
const YEARS = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1];

function isValidDays(value) {
  const n = Number(value);
  return value !== '' && !Number.isNaN(n) && n >= 0 && n <= 365 && Number.isInteger(n * 2);
}

/** One editable entitlement row. Uses PATCH for an existing balance and POST when none exists yet. */
function EntitlementEditor({ row, employeeId, year, onSaved }) {
  const toast = useToast();
  const [entitled, setEntitled] = useState(String(row.entitledDays));
  const [carry, setCarry] = useState(String(row.carryForwardDays));
  const [saving, setSaving] = useState(false);
  const dirty = !row.id || Number(entitled) !== row.entitledDays || Number(carry) !== row.carryForwardDays;
  const valid = isValidDays(entitled) && isValidDays(carry);

  const save = async () => {
    if (!valid) {
      toast.error('Days must be between 0 and 365, in whole or half days.');
      return;
    }
    setSaving(true);
    try {
      const payload = { entitledDays: Number(entitled), carryForwardDays: Number(carry) };
      if (row.id) await adminApi.updateBalance(row.id, payload);
      else await adminApi.createBalance({ ...payload, employeeId, leaveTypeId: row.leaveType.id, year });
      toast.success(`${row.leaveType.name} entitlement saved.`);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const idBase = `${row.leaveType.id}-${year}`;
  return (
    <div className="entitlement-editor">
      <label className="inline-field" htmlFor={`ent-${idBase}`}>
        <span>Entitled</span>
        <input id={`ent-${idBase}`} type="number" min="0" max="365" step="0.5" value={entitled} onChange={(e) => setEntitled(e.target.value)} aria-invalid={!isValidDays(entitled)} />
      </label>
      <label className="inline-field" htmlFor={`cf-${idBase}`}>
        <span>Carry fwd</span>
        <input id={`cf-${idBase}`} type="number" min="0" max="365" step="0.5" value={carry} onChange={(e) => setCarry(e.target.value)} aria-invalid={!isValidDays(carry)} />
      </label>
      <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={saving || !dirty}>
        {saving ? 'Saving…' : row.id ? 'Update' : 'Set'}
      </button>
    </div>
  );
}

export default function EntitlementsPage() {
  const [employeeId, setEmployeeId] = useState('');
  const [year, setYear] = useState(THIS_YEAR);

  const people = useApi(() => adminApi.users(), []);
  const leaveTypes = useApi(() => adminApi.leaveTypes(), []);
  const balances = useApi(() => adminApi.balances(employeeId ? { employeeId, year } : { year }), [employeeId, year]);

  const holders = (people.data?.users || []).filter((u) => u.role !== 'admin');
  const selectedEmployee = holders.find((u) => u.id === employeeId);

  // For a single employee, show every leave type: saved balances plus unset ones at their default.
  const rows = useMemo(() => {
    const saved = balances.data?.balances || [];
    if (!employeeId) return saved;
    // Only use rows for the selected employee (stale year-wide data may still be loaded).
    const own = saved.filter((b) => b.employee?.id === employeeId);
    const byType = new Map(own.map((b) => [b.leaveType.id, b]));
    const types = leaveTypes.data?.leaveTypes || [];
    return types
      .filter((t) => t.isActive || byType.has(t.id))
      .map(
        (t) =>
          byType.get(t.id) || {
            id: null,
            leaveType: t,
            entitledDays: t.defaultAnnualEntitlement,
            carryForwardDays: 0,
            usedDays: 0,
            pendingDays: 0,
            totalEntitled: t.defaultAnnualEntitlement,
            availableDays: t.defaultAnnualEntitlement,
          },
      );
  }, [balances.data, leaveTypes.data, employeeId]);

  const columns = [
    ...(employeeId
      ? []
      : [
          {
            key: 'employee',
            header: 'Employee',
            render: (b) => (
              <div className="person">
                <span className="person-name">{b.employee?.name}</span>
                <span className="muted small break">{b.employee?.email}</span>
              </div>
            ),
          },
        ]),
    {
      key: 'type',
      header: 'Leave type',
      render: (b) => (
        <div className="person">
          <span className="person-name">{b.leaveType?.name}</span>
          {!b.leaveType?.isActive && <ActiveBadge active={false} />}
          {!b.id && <span className="muted small">Not set — default shown</span>}
        </div>
      ),
    },
    { key: 'total', header: 'Total entitled', render: (b) => b.totalEntitled, className: 'num' },
    { key: 'used', header: 'Used', render: (b) => b.usedDays, className: 'num' },
    { key: 'pending', header: 'Pending', render: (b) => b.pendingDays, className: 'num' },
    { key: 'remaining', header: 'Remaining', render: (b) => <strong>{b.availableDays}</strong>, className: 'num' },
    {
      key: 'edit',
      header: 'Set entitlement',
      className: 'actions',
      render: (b) => (
        <EntitlementEditor
          // Re-mount when the saved values change so the inputs reflect the server state.
          key={`${b.id}-${b.entitledDays}-${b.carryForwardDays}`}
          row={b}
          employeeId={employeeId || b.employee?.id}
          year={year}
          onSaved={balances.reload}
        />
      ),
    },
  ];

  const loadError = people.error || leaveTypes.error || balances.error;

  return (
    <>
      <PageHeader title="Leave Entitlements" subtitle="Set the number of leave days each employee is entitled to per year." />
      <Card>
        <div className="filters">
          <Field label="Employee" htmlFor="ent-employee">
            <select id="ent-employee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">All employees (saved entitlements)</option>
              {holders.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {ROLE_LABELS[u.role]}
                  {u.isActive ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Year" htmlFor="ent-year">
            <select id="ent-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {selectedEmployee && (
          <p className="muted">
            Showing {year} entitlements for <strong>{selectedEmployee.name}</strong>. Leave types without a saved entitlement use their default; press
            “Set” to save one.
          </p>
        )}

        <ErrorBanner message={loadError} onRetry={() => { people.reload(); leaveTypes.reload(); balances.reload(); }} />
        {balances.loading || leaveTypes.loading ? (
          <Spinner />
        ) : (
          <DataTable
            caption="Leave entitlements"
            columns={columns}
            rows={rows}
            rowKey={(b) => b.id || `new-${b.leaveType.id}`}
            empty={
              <EmptyState
                title="No entitlements saved"
                message={employeeId ? 'No leave types are configured.' : `No entitlements saved for ${year}. Select an employee to set them.`}
              />
            }
          />
        )}
      </Card>
    </>
  );
}
