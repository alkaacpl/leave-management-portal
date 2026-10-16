import { formatDate, formatDateTime } from '../utils/dates.js';
import { StatusBadge } from './ui.jsx';

/** Definition list describing a single leave request. */
export default function LeaveRequestDetails({ request, showEmployee = false }) {
  const reviewed = request.status !== 'Pending';
  return (
    <dl className="details-list">
      {showEmployee && (
        <>
          <dt>Employee</dt>
          <dd>
            {request.employee?.name}
            <span className="muted block">{request.employee?.email}</span>
          </dd>
        </>
      )}
      <dt>Leave type</dt>
      <dd>{request.leaveType?.name}</dd>
      <dt>Dates</dt>
      <dd>
        {formatDate(request.startDate)} to {formatDate(request.endDate)}
      </dd>
      <dt>Working days</dt>
      <dd>{request.days}</dd>
      <dt>Status</dt>
      <dd>
        <StatusBadge status={request.status} />
      </dd>
      <dt>Reason</dt>
      <dd className="pre-wrap">{request.reason}</dd>
      {request.balance && (
        <>
          <dt>Balance ({request.year})</dt>
          <dd>
            {request.balance.availableDays} available of {request.balance.totalEntitled} ({request.balance.usedDays} used,{' '}
            {request.balance.pendingDays} pending incl. this request)
          </dd>
        </>
      )}
      <dt>Applied on</dt>
      <dd>{formatDateTime(request.createdAt)}</dd>
      <dt>Reporting manager</dt>
      <dd>{request.manager?.name || '—'}</dd>
      {reviewed && (
        <>
          <dt>Reviewed by</dt>
          <dd>{request.reviewedBy?.name || '—'}</dd>
          <dt>Reviewed on</dt>
          <dd>{formatDateTime(request.reviewedAt)}</dd>
          <dt>Manager remarks</dt>
          <dd className="pre-wrap">{request.managerRemarks || '—'}</dd>
        </>
      )}
    </dl>
  );
}
