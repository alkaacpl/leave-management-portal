import { dispatchInBackground, sendEmail } from './email.service.js';
import { leaveReviewedEmployee, leaveSubmittedEmployee, leaveSubmittedManager } from './templates.js';

// Leave workflow notifications. Call these only after the database write has succeeded;
// they run in the background and never throw into the request handler.

/** request must be populated with employee, manager and leaveType. */
export function notifyLeaveSubmitted(request) {
  return dispatchInBackground(() =>
    Promise.all([sendEmail(leaveSubmittedEmployee(request)), sendEmail(leaveSubmittedManager(request))]),
  );
}

/** request must be populated with employee, reviewedBy and leaveType. */
export function notifyLeaveReviewed(request) {
  return dispatchInBackground(() => sendEmail(leaveReviewedEmployee(request)));
}
