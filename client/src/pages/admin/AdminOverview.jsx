import { Link } from 'react-router-dom';
import { dashboardApi } from '../../api/endpoints.js';
import DataTable from '../../components/DataTable.jsx';
import { Card, EmptyState, ErrorBanner, PageHeader, Spinner, StatCard, StatusBadge } from '../../components/ui.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatDateRange, formatDay } from '../../utils/dates.js';

export default function AdminOverview() {
  const { data, loading, error, reload } = useApi(() => dashboardApi.admin(), []);

  if (loading && !data) return <Spinner label="Loading overview…" />;
  if (error && !data) return <ErrorBanner message={error} onRetry={reload} />;

  const { stats, recentRequests, year } = data;

  return (
    <>
      <PageHeader
        title="Administration"
        subtitle="Manage employees, leave types and entitlements."
        actions={
          <>
            <Link to="/admin/users" className="btn btn-primary">
              Manage employees
            </Link>
            <Link to="/admin/entitlements" className="btn btn-secondary">
              Entitlements
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard icon="user" label="Employees" value={stats.employees} />
        <StatCard icon="briefcase" label="Managers" value={stats.managers} />
        <StatCard icon="shield" label="Administrators" value={stats.admins} />
        <StatCard icon="userOff" label="Inactive accounts" value={stats.inactiveUsers} tone="danger" />
        <StatCard icon="layers" label="Active leave types" value={stats.activeLeaveTypes} tone="primary" hint={`${stats.inactiveLeaveTypes} inactive`} />
        <StatCard icon="clock" label={`Pending requests (${year})`} value={stats.pendingRequests} tone="warning" />
        <StatCard icon="check" label={`Approved (${year})`} value={stats.approvedRequests} tone="success" />
        <StatCard icon="x" label={`Rejected (${year})`} value={stats.rejectedRequests} tone="danger" />
      </div>

      <Card title="Recent leave requests">
        <DataTable
          caption="Recent leave requests"
          columns={[
            {
              key: 'employee',
              header: 'Employee',
              render: (r) => (
                <div className="person">
                  <span className="person-name">{r.employee?.name}</span>
                  <span className="muted small break">{r.employee?.email}</span>
                </div>
              ),
            },
            { key: 'type', header: 'Leave type', render: (r) => r.leaveType?.name },
            { key: 'dates', header: 'Dates', render: (r) => formatDateRange(r.startDate, r.endDate) },
            { key: 'days', header: 'Days', render: (r) => r.days, className: 'num' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'reviewer', header: 'Reviewed by', render: (r) => r.reviewedBy?.name || '—' },
            { key: 'applied', header: 'Applied', render: (r) => formatDay(r.createdAt) },
          ]}
          rows={recentRequests}
          empty={<EmptyState title="No leave requests yet" />}
        />
      </Card>
    </>
  );
}
