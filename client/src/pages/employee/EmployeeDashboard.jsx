import { useCallback, useState } from 'react';
import { dashboardApi, leaveApi } from '../../api/endpoints.js';
import DataTable from '../../components/DataTable.jsx';
import LeaveRequestDetails from '../../components/LeaveRequestDetails.jsx';
import Modal from '../../components/Modal.jsx';
import { Card, EmptyState, ErrorBanner, PageHeader, Spinner, StatCard, StatusBadge } from '../../components/ui.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatDateRange, formatDay } from '../../utils/dates.js';
import { ROLE_LABELS } from '../../utils/roles.js';
import ApplyLeaveForm from './ApplyLeaveForm.jsx';

const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Rejected'];

function BalanceCard({ balance }) {
  const total = balance.totalEntitled || 0;
  const pct = (n) => (total ? Math.min(100, (n / total) * 100) : 0);
  return (
    <div className="balance-card">
      <div className="balance-head">
        <span className="balance-name">{balance.leaveType.name}</span>
        <span className="badge badge-neutral">{balance.leaveType.code}</span>
      </div>
      <div className="balance-available">
        <span className="balance-number">{balance.availableDays}</span>
        <span className="muted">available</span>
      </div>
      <div className="meter" aria-hidden="true">
        <span className="meter-used" style={{ width: `${pct(balance.usedDays)}%` }} />
        <span className="meter-pending" style={{ width: `${pct(balance.pendingDays)}%` }} />
      </div>
      <dl className="balance-stats">
        <div>
          <dt>Entitled</dt>
          <dd>{total}</dd>
        </div>
        <div>
          <dt>Used</dt>
          <dd>{balance.usedDays}</dd>
        </div>
        <div>
          <dt>Pending</dt>
          <dd>{balance.pendingDays}</dd>
        </div>
      </dl>
      {balance.carryForwardDays > 0 && <small className="muted">Includes {balance.carryForwardDays} carried forward</small>}
    </div>
  );
}

export default function EmployeeDashboard() {
  const dashboard = useApi(() => dashboardApi.employee(), []);
  const [statusFilter, setStatusFilter] = useState('All');
  const history = useApi(() => leaveApi.mine(statusFilter === 'All' ? {} : { status: statusFilter }), [statusFilter]);
  const [selected, setSelected] = useState(null);

  const reloadAll = useCallback(() => {
    dashboard.reload();
    history.reload();
  }, [dashboard, history]);

  if (dashboard.loading && !dashboard.data) return <Spinner label="Loading your dashboard…" />;
  if (dashboard.error && !dashboard.data) return <ErrorBanner message={dashboard.error} onRetry={dashboard.reload} />;

  const { profile, balances, totals, leaveTypes, year, requestCounts } = dashboard.data;
  const requests = history.data?.requests || [];

  const columns = [
    { key: 'type', header: 'Leave type', render: (r) => r.leaveType?.name },
    { key: 'dates', header: 'Dates', render: (r) => formatDateRange(r.startDate, r.endDate) },
    { key: 'days', header: 'Days', render: (r) => r.days, className: 'num' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'applied', header: 'Applied', render: (r) => formatDay(r.createdAt) },
    {
      key: 'remarks',
      header: 'Manager remarks',
      render: (r) => (r.managerRemarks ? <span className="clamp">{r.managerRemarks}</span> : <span className="muted">—</span>),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'actions',
      render: (r) => (
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setSelected(r)}>
          View
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="My Leave" subtitle={`Welcome back, ${profile.name.split(' ')[0]}. Here is your leave summary for ${year}.`} />

      <div className="grid-2 profile-grid">
        <Card title="Profile">
          <dl className="details-list compact">
            <dt>Name</dt>
            <dd>{profile.name}</dd>
            <dt>Email</dt>
            <dd className="break">{profile.email}</dd>
            <dt>Role</dt>
            <dd>{ROLE_LABELS[profile.role]}</dd>
            <dt>Department</dt>
            <dd>{profile.department || '—'}</dd>
            <dt>Manager</dt>
            <dd>{profile.manager ? `${profile.manager.name} (${profile.manager.email})` : 'Not assigned'}</dd>
          </dl>
        </Card>
        <div className="stat-grid">
          <StatCard icon="calendar" label="Total entitled" value={totals.totalEntitled} hint={`${year}, all leave types`} />
          <StatCard icon="check" label="Approved days used" value={totals.usedDays} tone="success" />
          <StatCard icon="clock" label="Pending days reserved" value={totals.pendingDays} tone="warning" hint={`${requestCounts.Pending} pending request(s)`} />
          <StatCard icon="wallet" label="Available days" value={totals.availableDays} tone="primary" />
        </div>
      </div>

      <Card title="Leave balances">
        {balances.length ? (
          <div className="balance-grid">
            {balances.map((b) => (
              <BalanceCard key={b.id} balance={b} />
            ))}
          </div>
        ) : (
          <EmptyState title="No leave balances" message="No leave types are configured for this year." />
        )}
      </Card>

      <Card title="Apply for leave">
        {!profile.manager && (
          <div className="alert alert-warning" role="status">
            You do not have a reporting manager yet, so requests cannot be submitted. Please contact an administrator.
          </div>
        )}
        <ApplyLeaveForm leaveTypes={leaveTypes} balances={balances} onSubmitted={reloadAll} />
      </Card>

      <Card
        title="Leave history"
        actions={
          <div className="segmented" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map((s) => (
              <button key={s} type="button" className={s === statusFilter ? 'active' : ''} aria-pressed={s === statusFilter} onClick={() => setStatusFilter(s)}>
                {s}
              </button>
            ))}
          </div>
        }
      >
        <ErrorBanner message={history.error} onRetry={history.reload} />
        {history.loading && !history.data ? (
          <Spinner />
        ) : (
          <DataTable
            caption="Your leave requests"
            columns={columns}
            rows={requests}
            empty={<EmptyState title="No leave requests" message={statusFilter === 'All' ? 'Requests you submit will appear here.' : `No ${statusFilter.toLowerCase()} requests.`} />}
          />
        )}
      </Card>

      {selected && (
        <Modal title="Leave request details" onClose={() => setSelected(null)}>
          <LeaveRequestDetails request={selected} />
        </Modal>
      )}
    </>
  );
}
