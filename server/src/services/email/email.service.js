import nodemailer from 'nodemailer';
import { config } from '../../config/env.js';

/**
 * Single email gateway for the application.
 *
 * - SMTP settings come only from environment variables (config.smtp).
 * - sendEmail() never throws: SMTP failures are logged (without secrets) and reported in the
 *   return value, so a failed email can never undo a saved leave request or review.
 * - Recipients on reserved, non-routable domains (.local, .test, .example, .invalid, .localhost),
 *   such as the seeded demo accounts, are skipped to avoid bounce-backs.
 */

const UNDELIVERABLE_DOMAIN = /\.(local|test|example|invalid|localhost)$/i;

let transport = null;
let transportOverride = null;
const pending = new Set();

function log(...args) {
  if (!config.isTest) console.log('[email]', ...args);
}

/** Mask an address for logs: a***@gmail.com */
export function maskAddress(address = '') {
  const [local, domain] = String(address).split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

export function isDeliverableAddress(address) {
  const domain = String(address || '').split('@')[1] || '';
  return Boolean(domain) && !UNDELIVERABLE_DOMAIN.test(domain);
}

export function isEmailConfigured() {
  const { host, user, pass, from } = config.smtp;
  return Boolean(host && user && pass && from);
}

function getTransport() {
  if (transportOverride) return transportOverride;
  if (!transport) {
    const { host, port, secure, user, pass } = config.smtp;
    transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transport;
}

/** Tests only: replace the SMTP transport with a mock ({ sendMail, verify? }). Pass null to reset. */
export function setTransportForTesting(mock) {
  transportOverride = mock;
}

function emailActive() {
  return Boolean(transportOverride) || (config.emailEnabled && isEmailConfigured());
}

/** Describe an SMTP error without leaking credentials or full server responses. */
function describeError(err) {
  const parts = [err?.code, err?.responseCode, err?.command].filter(Boolean);
  return `${parts.join(' ')} ${err?.message || 'Unknown error'}`.trim();
}

/** Submit a message through the configured transport. Throws on SMTP errors (used by scripts). */
export function submitMessage({ to, subject, html, text }) {
  return getTransport().sendMail({ from: config.smtp.from, to, subject, html, text });
}

/**
 * Send one message. Resolves to { status: 'sent' | 'skipped' | 'failed', ... }; never rejects.
 * 'sent' means the SMTP server accepted the message for delivery, not that it reached the inbox.
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!emailActive()) return { status: 'skipped', reason: 'email disabled or not configured' };
  if (!to || !isDeliverableAddress(to)) {
    log(`skipped "${subject}" to ${maskAddress(to)} (non-deliverable address)`);
    return { status: 'skipped', reason: 'non-deliverable address' };
  }
  try {
    const info = await submitMessage({ to, subject, html, text });
    log(`submitted "${subject}" to ${maskAddress(to)} messageId=${info?.messageId || 'n/a'}`);
    return { status: 'sent', messageId: info?.messageId, accepted: info?.accepted, rejected: info?.rejected };
  } catch (err) {
    console.error(`[email] failed "${subject}" to ${maskAddress(to)}: ${describeError(err)}`);
    return { status: 'failed', error: describeError(err) };
  }
}

/**
 * Run an email task in the background after a successful database write.
 * The HTTP response is not delayed, and any error is swallowed and logged.
 */
export function dispatchInBackground(task) {
  const promise = Promise.resolve()
    .then(task)
    .catch((err) => console.error(`[email] notification error: ${describeError(err)}`))
    .finally(() => pending.delete(promise));
  pending.add(promise);
  return promise;
}

/** Wait for background notifications (used by tests and graceful shutdown). */
export async function waitForPendingEmails() {
  while (pending.size) await Promise.allSettled([...pending]);
}

/** Check SMTP connectivity and authentication without sending anything. */
export async function verifyConnection() {
  if (!isEmailConfigured()) return { ok: false, error: 'SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM must be set.' };
  try {
    await getTransport().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}
