import { useState } from 'react';
import { dashboardApi, leaveApi } from '../../api/endpoints.js';
import DataTable from '../../components/DataTable.jsx';
import LeaveRequestDetails from '../../components/LeaveRequestDetails.jsx';
import Modal from '../../components/Modal.jsx';
import { Card, EmptyState, ErrorBanner, PageHeader, Spinner, StatCard, StatusBadge } from '../../components/ui.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatDateRange, formatDateTime, formatDay } from '../../utils/dates.js';
import ReviewDialog from './ReviewDialog.jsx';

const HISTORY_FILTERS = ['All', 'Pending', 'Approved', 'Rejected'];

function EmployeeCell({ employee }) {
  return (
    <div className="person">
      <span className="person-name">{employee?.name}</span>
      <span className="muted small break">{employee?.email}</span>
    </div>
  );
}

export default function ManagerDashboard() {
  const dashboard = useApi(() => dashboardApi.manager(), []);
  const [tab, setTab] = useState('pending');
  const [historyFilter, setHistoryFilter] = useState('All');
  const history = useApi(
    () => (tab === 'history' ? leaveApi.team(historyFilter === 'All' ? {} : { status: historyFilter }) : Promise.resolve(null)),
    [tab, historyFilter],
  );
  const [details, setDetails] = useState(null);
  const [review, setReview] = useState(null); // { request, decision }

  if (dashboard.loading && !dashboard.data) return <Spinner label="Loading team requests…" />;
  if (dashboard.error && !dashboard.data) return <ErrorBanner message={dashboard.error} onRetry={dashboard.reload} />;

  const { stats, pendingRequests, team } = dashboard.data;

  const pendingColumns = [
    { key: 'employee', header: 'Employee', render: (r) => <EmployeeCell employee={r.employee} /> },
    { key: 'type', header: 'Leave type', render: (r) => r.leaveType?.name },
    { key: 'dates', header: 'Dates', render: (r) => formatDateRange(r.startDate, r.endDate) },
    { key: 'days', header: 'Days', render: (r) => r.days, className: 'num' },
    { key: 'reason', header: 'Reason', render: (r) => <span className="clamp">{r.reason}</span> },
    {
      key: 'balance',
      header: 'Available',
      render: (r) => (r.balance ? `${r.balance.availableDays} of ${r.balance.totalEntitled}` : '—'),
    },
    { key: 'applied', header: 'Applied', render: (r) => formatDay(r.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      className: 'actions',
      render: (r) => (
        <div className="btn-row">
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setDetails(r)}>
            Details
          </button>
          <button type="button" className="btn btn-sm btn-success" onClick={() => setReview({ request: r, decision: 'Approved' })}>
            Approve
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => setReview({ request: r, decision: 'Rejected' })}>
            Reject
          </button>
        </div>
      ),
    },
  ];

  const historyColumns = [
    { key: 'employee', header: 'Employee', render: (r) => <EmployeeCell employee={r.employee} /> },
    { key: 'type', header: 'Leave type', render: (r) => r.leaveType?.name },
    { key: 'dates', header: 'Dates', render: (r) => formatDateRange(r.startDate, r.endDate) },
    { key: 'days', header: 'Days', render: (r) => r.days, className: 'num' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'reviewer', header: 'Reviewed by', render: (r) => r.reviewedBy?.name || '—' },
    { key: 'reviewedAt', header: 'Reviewed on', render: (r) => formatDateTime(r.reviewedAt) },
    {
      key: 'actions',
      header: 'Actions',
      className: 'actions',
      render: (r) => (
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setDetails(r)}>
          Details
        </button>
      ),
    },
  ];

  const onReviewed = () => {
    setReview(null);
    dashboard.reload();
    if (tab === 'history') history.reload();
  };

  return (
    <>
      <PageHeader title="Team Approvals" subtitle="Review leave requests from employees who report to you." />

      <div className="stat-grid stat-grid-5">
        <StatCard icon="clock" label="Pending requests" value={stats.pendingCount} tone="warning" />
        <StatCard icon="users" label="Team members" value={stats.teamSize} />
        <StatCard icon="sun" label="On leave today" value={stats.onLeaveToday} tone="primary" />
        <StatCard icon="check" label="Approved this year" value={stats.approvedThisYear} tone="success" />
        <StatCard icon="x" label="Rejected this year" value={stats.rejectedThisYear} tone="danger" />
      </div>

      <div className="tabs" role="tablist" aria-label="Team requests">
        <button type="button" role="tab" aria-selected={tab === 'pending'} className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
          Pending ({stats.pendingCount})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          Team history
        </button>
        <button type="button" role="tab" aria-selected={tab === 'team'} className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>
          My team ({team.length})
        </button>
      </div>

      {tab === 'pending' && (
        <Card title="Pending leave requests">
          <ErrorBanner message={dashboard.error} onRetry={dashboard.reload} />
          <DataTable
            caption="Pending leave requests"
            columns={pendingColumns}
            rows={pendingRequests}
            empty={<EmptyState title="All caught up" message="There are no pending requests from your team." />}
          />
        </Card>
      )}

      {tab === 'history' && (
        <Card
          title="Team leave history"
          actions={
            <div className="segmented" role="group" aria-label="Filter by status">
              {HISTORY_FILTERS.map((s) => (
                <button key={s} type="button" className={s === historyFilter ? 'active' : ''} aria-pressed={s === historyFilter} onClick={() => setHistoryFilter(s)}>
                  {s}
                </button>
              ))}
            </div>
          }
        >
          <ErrorBanner message={history.error} onRetry={history.reload} />
          {history.loading ? (
            <Spinner />
          ) : (
            <DataTable
              caption="Team leave history"
              columns={historyColumns}
              rows={history.data?.requests || []}
              empty={<EmptyState title="No requests" message="No leave requests match this filter." />}
            />
          )}
        </Card>
      )}

      {tab === 'team' && (
        <Card title="Employees reporting to you">
          <DataTable
            caption="Team members"
            columns={[
              { key: 'name', header: 'Name', render: (u) => u.name },
              { key: 'email', header: 'Email', render: (u) => <span className="break">{u.email}</span> },
              { key: 'department', header: 'Department', render: (u) => u.department || '—' },
              { key: 'status', header: 'Status', render: (u) => (u.isActive ? 'Active' : 'Inactive') },
            ]}
            rows={team}
            empty={<EmptyState title="No team members" message="An administrator can assign employees to you." />}
          />
        </Card>
      )}

      {details && (
        <Modal title="Leave request details" onClose={() => setDetails(null)}>
          <LeaveRequestDetails request={details} showEmployee />
        </Modal>
      )}
      {review && <ReviewDialog request={review.request} decision={review.decision} onClose={() => setReview(null)} onReviewed={onReviewed} />}
    </>
  );
}
