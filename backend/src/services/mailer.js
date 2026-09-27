import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport;

function getTransport() {
  if (transport !== undefined) return transport;
  transport = config.smtp.host
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      })
    : null;
  return transport;
}

const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function layout({ heading, body, ctaLabel, ctaUrl, tone = 'normal' }) {
  const accent = tone === 'alert' ? '#b8211f' : '#df2f25';
  return `<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Segoe UI,Arial,sans-serif;color:#1e1b4b">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
      <tr><td style="background:#0b0d1a;padding:18px 28px;border-bottom:3px solid ${accent}">
        <img src="${escape(config.appUrl)}/logo-mark.png" width="36" height="36" alt="" style="vertical-align:middle;border:0">
        <span style="vertical-align:middle;margin-left:10px;color:#fff;font-size:15px;font-weight:700;letter-spacing:5px">V AGENCY</span>
      </td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 12px;font-size:20px">${escape(heading)}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151">${escape(body)}</p>
        ${ctaUrl ? `<a href="${escape(ctaUrl)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${escape(ctaLabel || 'Open V Agency')}</a>` : ''}
      </td></tr>
      <tr><td style="padding:16px 28px;font-size:12px;color:#9ca3af;border-top:1px solid #eef0f6">This is an automated message from V Agency Operations.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

/** Sends a branded email. Never throws: email failure must not break the request that triggered it. */
export async function sendMail({ to, subject, heading, body, ctaLabel, ctaUrl, tone }) {
  const recipients = [].concat(to).filter(Boolean);
  if (!recipients.length) return;
  const t = getTransport();
  if (!t) {
    if (config.env !== 'test') console.log(`[mail:disabled] to=${recipients.join(',')} subject="${subject}"`);
    return;
  }
  try {
    await t.sendMail({
      from: config.smtp.from,
      to: recipients.join(','),
      subject,
      text: `${heading}\n\n${body}${ctaUrl ? `\n\n${ctaUrl}` : ''}`,
      html: layout({ heading, body, ctaLabel, ctaUrl, tone }),
    });
  } catch (err) {
    console.error('[mail] failed to send', subject, err.message);
  }
}
