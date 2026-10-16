import { useEffect, useState } from 'react';
import { adminApi } from '../../api/endpoints.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import { ActiveBadge, Card, EmptyState, ErrorBanner, Field, PageHeader, Spinner } from '../../components/ui.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { getErrorMessage } from '../../utils/errors.js';
import { ROLE_LABELS } from '../../utils/roles.js';
import UserFormDialog from './UserFormDialog.jsx';

export default function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [filters, setFilters] = useState({ role: '', active: '', search: '' });
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // user object, 'new', or null
  const [toggling, setToggling] = useState(null);

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search })), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
  const users = useApi(() => adminApi.users(params), [filters.role, filters.active, filters.search]);
  const reviewers = useApi(() => adminApi.users({ active: 'true' }), []);
  const managers = (reviewers.data?.users || []).filter((u) => u.role === 'manager' || u.role === 'admin');

  const reloadAll = () => {
    users.reload();
    reviewers.reload();
  };

  const toggleActive = async () => {
    const target = toggling;
    try {
      await adminApi.updateUser(target.id, { isActive: !target.isActive });
      toast.success(`${target.name} ${target.isActive ? 'deactivated' : 'activated'}.`);
      reloadAll();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setToggling(null);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <div className="person">
          <span className="person-name">
            {u.name}
            {u.id === me.id && <span className="muted"> (you)</span>}
          </span>
          <span className="muted small break">{u.email}</span>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (u) => ROLE_LABELS[u.role] },
    { key: 'department', header: 'Department', render: (u) => u.department || '—' },
    { key: 'manager', header: 'Manager', render: (u) => u.manager?.name || <span className="muted">None</span> },
    { key: 'status', header: 'Status', render: (u) => <ActiveBadge active={u.isActive} /> },
    {
      key: 'actions',
      header: 'Actions',
      className: 'actions',
      render: (u) => (
        <div className="btn-row">
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditing(u)}>
            Edit
          </button>
          {u.id !== me.id && (
            <button type="button" className={`btn btn-sm ${u.isActive ? 'btn-danger-outline' : 'btn-success'}`} onClick={() => setToggling(u)}>
              {u.isActive ? 'Deactivate' : 'Activate'}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Create accounts, change roles and assign reporting managers."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            Add user
          </button>
        }
      />

      <Card>
        <div className="filters">
          <Field label="Search" htmlFor="user-search">
            <input id="user-search" type="search" placeholder="Name, email or department" value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <Field label="Role" htmlFor="role-filter">
            <select id="role-filter" value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}>
              <option value="">All roles</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" htmlFor="status-filter">
            <select id="status-filter" value={filters.active} onChange={(e) => setFilters((f) => ({ ...f, active: e.target.value }))}>
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </Field>
        </div>

        <ErrorBanner message={users.error} onRetry={users.reload} />
        {users.loading && !users.data ? (
          <Spinner />
        ) : (
          <DataTable caption="Users" columns={columns} rows={users.data?.users || []} empty={<EmptyState title="No users found" message="Try a different filter." />} />
        )}
      </Card>

      {editing && (
        <UserFormDialog
          user={editing === 'new' ? null : editing}
          managers={managers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reloadAll();
          }}
        />
      )}
      {toggling && (
        <ConfirmDialog
          title={toggling.isActive ? 'Deactivate account' : 'Activate account'}
          message={
            toggling.isActive
              ? `${toggling.name} will be signed out and unable to log in. Their leave history is kept.`
              : `${toggling.name} will be able to sign in again.`
          }
          confirmLabel={toggling.isActive ? 'Deactivate' : 'Activate'}
          tone={toggling.isActive ? 'danger' : 'success'}
          onConfirm={toggleActive}
          onCancel={() => setToggling(null)}
        />
      )}
    </>
  );
}
