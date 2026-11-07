import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

type Email = { to: string; subject: string; html: string; text: string };

// The transport is made on the first email and made again when SMTP_URL
// changes, so a test can point the next email at a port nobody listens on
let cached: { url: string; transport: Transporter } | undefined;

// Where the email goes is decided by SMTP_URL alone: Mailpit on my computer
// and in the tests, Resend on the server. The same build everywhere.
function transportFor(smtpUrl: string): Transporter {
  if (cached?.url === smtpUrl) return cached.transport;

  const url = new URL(smtpUrl);
  const transport = nodemailer.createTransport({
    host: url.hostname,
    port: Number(url.port) || (url.protocol === "smtps:" ? 465 : 25),
    // smtps:// is encrypted from the start; smtp:// upgrades when the server can
    secure: url.protocol === "smtps:",
    auth: url.username
      ? {
          user: decodeURIComponent(url.username),
          pass: decodeURIComponent(url.password),
        }
      : undefined,
    // A person waits for the answer of the form: fail in seconds, not minutes
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  cached = { url: smtpUrl, transport };
  return transport;
}

export async function sendEmail({ to, subject, html, text }: Email) {
  const smtpUrl = process.env.SMTP_URL;
  const from = process.env.MAIL_FROM;
  if (!smtpUrl || !from) {
    throw new Error(
      "Email settings are missing: set SMTP_URL and MAIL_FROM in .env",
    );
  }

  await transportFor(smtpUrl).sendMail({ from, to, subject, html, text });
}
