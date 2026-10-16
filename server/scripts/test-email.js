/**
 * Check the SMTP configuration and, only when asked explicitly, send one test email.
 *
 *   npm run email:verify                       -> connect + authenticate, sends nothing
 *   npm run email:test -- --to you@example.com -> verify, then send one test message
 *
 * Secrets are never printed.
 */
import { config } from '../src/config/env.js';
import { isEmailConfigured, maskAddress, submitMessage, verifyConnection } from '../src/services/email/email.service.js';
import { escapeHtml } from '../src/services/email/templates.js';

const args = process.argv.slice(2);
const toIndex = args.indexOf('--to');
const to = toIndex >= 0 ? args[toIndex + 1] : null;

function show(label, value) {
  console.log(`  ${label.padEnd(12)} ${value}`);
}

async function main() {
  const { host, port, secure, user, pass, from } = config.smtp;
  console.log('SMTP configuration (from server/.env):');
  show('SMTP_HOST', host || '(missing)');
  show('SMTP_PORT', port);
  show('SMTP_SECURE', secure);
  show('SMTP_USER', user ? maskAddress(user) : '(missing)');
  show('SMTP_PASS', pass ? `set (${pass.length} characters, hidden)` : '(missing)');
  show('MAIL_FROM', from ? from.replace(/<([^>]+)>/, (_m, a) => `<${maskAddress(a)}>`) : '(missing)');

  if (!isEmailConfigured()) {
    console.error('\nFAIL: SMTP is not fully configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM.');
    process.exitCode = 1;
    return;
  }

  console.log('\nStep 1 - SMTP verification (connect + login, nothing is sent)...');
  const result = await verifyConnection();
  if (!result.ok) {
    console.error(`FAIL: ${result.error}`);
    console.error('Hint: for Gmail, SMTP_PASS must be a 16-character App Password (2-Step Verification required).');
    process.exitCode = 1;
    return;
  }
  console.log('OK: SMTP server accepted the connection and credentials.');

  if (!to) {
    console.log('\nNo test email sent. To send one, run:  npm run email:test -- --to recipient@example.com');
    return;
  }

  console.log(`\nStep 2 - Submitting a test email to ${maskAddress(to)}...`);
  const sentAt = new Date().toISOString();
  const info = await submitMessage({
    to,
    subject: 'Leave Management Portal - SMTP test email',
    text: `This is a test email from the Leave Management Portal.\nSent at ${sentAt}.\nIf you received it, email notifications are working.`,
    html: `<p>This is a test email from the <strong>Leave Management Portal</strong>.</p><p>Sent at ${escapeHtml(sentAt)}.</p><p>If you received it, email notifications are working.</p>`,
  });
  console.log('OK: SMTP server accepted the message for delivery.');
  show('messageId', info.messageId);
  show('accepted', (info.accepted || []).map(maskAddress).join(', ') || '(none)');
  show('rejected', (info.rejected || []).map(maskAddress).join(', ') || '(none)');
  console.log('\nNote: acceptance by SMTP is not proof of delivery. Check the recipient inbox (and spam folder)');
  console.log('to confirm delivery; bounces are returned to the sender mailbox.');
}

main().catch((err) => {
  console.error(`FAIL: ${err?.code || ''} ${err?.message || err}`.trim());
  process.exitCode = 1;
});
