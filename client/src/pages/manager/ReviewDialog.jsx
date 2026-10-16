import { useState } from 'react';
import { leaveApi } from '../../api/endpoints.js';
import LeaveRequestDetails from '../../components/LeaveRequestDetails.jsx';
import Modal from '../../components/Modal.jsx';
import { Field } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getErrorMessage } from '../../utils/errors.js';

/** Confirm an approve/reject decision. Rejection requires remarks. */
export default function ReviewDialog({ request, decision, onClose, onReviewed }) {
  const toast = useToast();
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isReject = decision === 'Rejected';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (isReject && !remarks.trim()) {
      setError('Please give a reason for rejecting this request.');
      return;
    }
    setSubmitting(true);
    try {
      await leaveApi.review(request.id, { status: decision, remarks: remarks.trim() });
      toast.success(`Request from ${request.employee.name} ${isReject ? 'rejected' : 'approved'}.`);
      onReviewed();
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={isReject ? 'Reject leave request' : 'Approve leave request'}
      onClose={submitting ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" form="review-form" className={`btn ${isReject ? 'btn-danger' : 'btn-success'}`} disabled={submitting}>
            {submitting ? 'Saving…' : isReject ? 'Reject request' : 'Approve request'}
          </button>
        </>
      }
    >
      <LeaveRequestDetails request={request} showEmployee />
      <form id="review-form" onSubmit={submit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <Field
          label={isReject ? 'Reason for rejection' : 'Remarks (optional)'}
          htmlFor="review-remarks"
          required={isReject}
          hint={`${remarks.length}/500`}
        >
          <textarea id="review-remarks" rows={3} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
