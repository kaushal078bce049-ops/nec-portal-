import 'server-only';

import nodemailer from 'nodemailer';

import { publicEnv, serverEnv } from '@/lib/env';

/**
 * Outgoing mail, sent by this application rather than by Supabase.
 *
 * Supabase will happily send the confirmation email itself, and that is the
 * obvious arrangement — but its built-in sender allows a handful of messages an
 * hour and is documented as a development convenience. Since every account here
 * must confirm an address before it can read anything, that ceiling *is* the
 * signup capacity: a class registering together exhausts it and the rest are
 * turned away with an error about rate limits that they can do nothing about.
 *
 * So the app owns the flow instead. `admin.generateLink` hands us the action
 * link without sending anything, and this module delivers it over ordinary
 * SMTP. The limit becomes the mail provider's — thousands a day rather than a
 * handful an hour — and the message is ours to write.
 *
 * With SMTP unconfigured every function here returns `false` rather than
 * throwing. A missing mail server should leave an account created and awaiting
 * confirmation, which an administrator can resolve, not destroy the signup
 * half-way through with a 500.
 */

function transport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = serverEnv();
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  const port = Number(SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 opens plain and upgrades with STARTTLS. Setting
    // `secure` for the wrong port hangs until the socket times out rather than
    // failing cleanly, which is a miserable thing to debug.
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export function isEmailConfigured(): boolean {
  try {
    const { SMTP_HOST, SMTP_USER, SMTP_PASS } = serverEnv();
    return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
  } catch {
    return false;
  }
}

function sender(): string {
  const { SMTP_FROM, SMTP_USER } = serverEnv();
  const address = SMTP_FROM || SMTP_USER || '';
  return address.includes('<') ? address : `"NEC Civil License Portal" <${address}>`;
}

/** Shared chrome, so every message looks like it came from the same place. */
function wrap(heading: string, body: string, cta?: { href: string; label: string }): string {
  const site = publicEnv().NEXT_PUBLIC_SITE_URL;
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.55;color:#1f2933;max-width:560px;margin:0 auto;padding:8px">
  <h1 style="margin:0 0 2px;font-size:19px;letter-spacing:-0.01em">NEC Civil License Portal</h1>
  <p style="margin:0 0 20px;color:#64748b;font-size:13px">${heading}</p>
  ${body}
  ${cta ? `<p style="margin:26px 0">
    <a href="${cta.href}" style="background:#1f2933;color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${cta.label}</a>
  </p>
  <p style="color:#64748b;font-size:12px;word-break:break-all;margin:0 0 4px">
    If the button does not work, copy this into your browser:<br>${cta.href}
  </p>` : ''}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:26px 0 14px">
  <p style="color:#94a3b8;font-size:12px;margin:0">
    ${site} · Prepared by Kaushal Karki
  </p>
</div>`;
}

async function send(to: string, subject: string, text: string, html: string): Promise<boolean> {
  const t = transport();
  if (!t) return false;
  try {
    await t.sendMail({ from: sender(), to, subject, text, html });
    return true;
  } catch (err) {
    // Logged, not thrown. The caller has usually created an account by this
    // point; failing the whole request would leave the person with an error and
    // no way to tell that the account exists.
    console.error('[email] send failed to ' + to + ': ' + (err as Error).message);
    return false;
  } finally {
    t.close();
  }
}

export async function sendConfirmationEmail(
  to: string,
  link: string,
  name?: string,
): Promise<boolean> {
  const greeting = name?.trim() ? `Hello ${name.trim()},` : 'Hello,';
  return send(
    to,
    'Confirm your email — NEC Civil License Portal',
    `${greeting}\n\nConfirm your email address to finish creating your account:\n\n${link}\n\n`
    + 'The portal has the full NEC civil syllabus, theory for all 60 subchapters, '
    + '20 past papers, 12 model sets and 4,220 questions with worked solutions.\n\n'
    + 'If you did not create this account you can ignore this message.\n',
    wrap(
      'Confirm your email address',
      `<p style="margin:0 0 12px">${greeting}</p>
       <p style="margin:0 0 12px">One click and your account is ready.</p>
       <p style="margin:0;color:#475569;font-size:14px">Inside: the full NEC civil syllabus,
       theory for all 60 subchapters, 20 past papers, 12 model sets, and 4,220 questions
       with worked solutions.</p>`,
      { href: link, label: 'Confirm my email' },
    ),
  );
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<boolean> {
  return send(
    to,
    'Reset your password — NEC Civil License Portal',
    `Use this link to choose a new password:\n\n${link}\n\n`
    + 'If you did not ask to reset it, ignore this message and nothing changes.\n',
    wrap(
      'Reset your password',
      `<p style="margin:0 0 12px">Choose a new password with the link below.</p>
       <p style="margin:0;color:#475569;font-size:14px">If you did not ask for this,
       ignore this message — nothing changes until the link is used.</p>`,
      { href: link, label: 'Choose a new password' },
    ),
  );
}
