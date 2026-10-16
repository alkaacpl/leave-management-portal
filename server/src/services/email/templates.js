import { config } from '../../config/env.js';
import { formatDateOnly } from '../../utils/dates.js';

// HTML + plain-text email templates for leave notifications.
// All user-supplied text (names, reasons, remarks) is HTML-escaped.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function prettyDate(value) {
  const iso = value instanceof Date ? formatDateOnly(value) : String(value || '').slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : iso;
}

function dateRange(request) {
  const start = prettyDate(request.startDate);
  const end = prettyDate(request.endDate);
  return start === end ? start : `${start} to ${end}`;
}

const STATUS_COLORS = { Pending: '#9a6200', Approved: '#17804a', Rejected: '#c22f3a' };

function layout({ heading, intro, rows, note, cta }) {
  const tableRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;color:#5e6880;font-size:14px;white-space:nowrap;vertical-align:top;border-bottom:1px solid #eef1f6;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;color:#1c2333;font-size:14px;vertical-align:top;border-bottom:1px solid #eef1f6;">${value}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e1e5ee;border-radius:10px;">
        <tr><td style="background:#2f5bea;color:#ffffff;padding:16px 24px;border-radius:10px 10px 0 0;font-size:16px;font-weight:600;">Leave Management Portal</td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#1c2333;">${escapeHtml(heading)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#1c2333;">${intro}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e1e5ee;border-radius:8px;border-collapse:separate;">${tableRows}</table>
          ${note ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#5e6880;">${note}</p>` : ''}
          ${
            cta
              ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#2f5bea;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(cta.label)}</a></p>`
              : ''
          }
        </td></tr>
        <tr><td style="padding:14px 24px;border-top:1px solid #e1e5ee;font-size:12px;color:#8a93a8;">This is an automated message from the Leave Management Portal. Please do not reply to this email.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function textBlock({ greeting, lines, rows, footer }) {
  const details = rows.map(([label, value]) => `${label}: ${value}`).join('\n');
  return [greeting, '', ...lines, '', details, '', ...(footer || []), '', '-- Leave Management Portal (automated message)'].join('\n');
}

function badge(status) {
  return `<strong style="color:${STATUS_COLORS[status] || '#1c2333'};">${escapeHtml(status)}</strong>`;
}

function requestRows(request, { html }) {
  const v = (x) => (html ? escapeHtml(x) : String(x));
  return [
    ['Leave type', v(request.leaveType?.name || '')],
    ['Dates', v(dateRange(request))],
    ['Working days', v(request.days)],
    ['Reason', v(request.reason)],
  ];
}

/** Confirmation to the employee after submitting a request. */
export function leaveSubmittedEmployee(request) {
  const employee = request.employee;
  const managerName = request.manager?.name || 'your manager';
  const subject = `Leave request submitted: ${request.leaveType?.name} (${dateRange(request)})`;
  const rows = [...requestRows(request, { html: true }), ['Status', badge('Pending')], ['Approver', escapeHtml(managerName)]];
  const textRows = [...requestRows(request, { html: false }), ['Status', 'Pending'], ['Approver', managerName]];
  return {
    to: employee?.email,
    subject,
    html: layout({
      heading: 'Your leave request has been submitted',
      intro: `Hello ${escapeHtml(employee?.name)}, your leave request has been received and sent to ${escapeHtml(managerName)} for approval.`,
      rows,
      note: `The ${escapeHtml(request.days)} working day(s) are reserved from your balance until the request is reviewed.`,
      cta: { label: 'View my leave', url: `${config.appUrl}/employee` },
    }),
    text: textBlock({
      greeting: `Hello ${employee?.name},`,
      lines: [`Your leave request has been received and sent to ${managerName} for approval.`],
      rows: textRows,
      footer: [`The ${request.days} working day(s) are reserved from your balance until the request is reviewed.`, `View your leave: ${config.appUrl}/employee`],
    }),
  };
}

/** Notification to the assigned manager that a new request needs review. */
export function leaveSubmittedManager(request) {
  const employee = request.employee;
  const manager = request.manager;
  const subject = `Action required: leave request from ${employee?.name}`;
  const rows = [['Employee', `${escapeHtml(employee?.name)} (${escapeHtml(employee?.email)})`], ...requestRows(request, { html: true })];
  const textRows = [['Employee', `${employee?.name} (${employee?.email})`], ...requestRows(request, { html: false })];
  return {
    to: manager?.email,
    subject,
    html: layout({
      heading: 'New leave request awaiting your review',
      intro: `Hello ${escapeHtml(manager?.name)}, ${escapeHtml(employee?.name)} has submitted a leave request that needs your decision.`,
      rows,
      cta: { label: 'Review request', url: `${config.appUrl}/manager` },
    }),
    text: textBlock({
      greeting: `Hello ${manager?.name},`,
      lines: [`${employee?.name} has submitted a leave request that needs your decision.`],
      rows: textRows,
      footer: [`Review it here: ${config.appUrl}/manager`],
    }),
  };
}

/** Decision notification to the employee (approved or rejected). Rejections include the remarks. */
export function leaveReviewedEmployee(request) {
  const employee = request.employee;
  const reviewer = request.reviewedBy?.name || 'Your manager';
  const approved = request.status === 'Approved';
  const remarks = request.managerRemarks || '';
  const subject = `Leave request ${approved ? 'approved' : 'rejected'}: ${request.leaveType?.name} (${dateRange(request)})`;

  const rows = [...requestRows(request, { html: true }), ['Decision', badge(request.status)], ['Reviewed by', escapeHtml(reviewer)]];
  const textRows = [...requestRows(request, { html: false }), ['Decision', request.status], ['Reviewed by', reviewer]];
  if (remarks || !approved) {
    rows.push([approved ? 'Remarks' : 'Reason for rejection', escapeHtml(remarks || '—')]);
    textRows.push([approved ? 'Remarks' : 'Reason for rejection', remarks || '—']);
  }

  const note = approved
    ? `${escapeHtml(request.days)} working day(s) have been deducted from your leave balance.`
    : `The ${escapeHtml(request.days)} reserved working day(s) have been returned to your leave balance.`;
  const textNote = approved
    ? `${request.days} working day(s) have been deducted from your leave balance.`
    : `The ${request.days} reserved working day(s) have been returned to your leave balance.`;

  return {
    to: employee?.email,
    subject,
    html: layout({
      heading: approved ? 'Your leave request was approved' : 'Your leave request was rejected',
      intro: `Hello ${escapeHtml(employee?.name)}, ${escapeHtml(reviewer)} has ${approved ? 'approved' : 'rejected'} your leave request.`,
      rows,
      note,
      cta: { label: 'View my leave', url: `${config.appUrl}/employee` },
    }),
    text: textBlock({
      greeting: `Hello ${employee?.name},`,
      lines: [`${reviewer} has ${approved ? 'approved' : 'rejected'} your leave request.`],
      rows: textRows,
      footer: [textNote, `View your leave: ${config.appUrl}/employee`],
    }),
  };
}
