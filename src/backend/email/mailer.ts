import nodemailer, { type Transporter } from "nodemailer";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  const host = process.env.SMTP_HOST;
  if (!host) {
    transporter = null;
    return transporter;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
  });
  return transporter;
}

export function emailEnabled(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

/**
 * Sends a transactional email. When SMTP is not configured the message is
 * logged instead of thrown, so a deployment without a mail provider still
 * works — links can be recovered from the logs.
 */
export async function sendEmail(message: OutgoingEmail): Promise<void> {
  const transport = getTransporter();
  const from = process.env.SMTP_FROM ?? "no-reply@localhost";

  if (!transport) {
    console.warn(
      `[email] SMTP is not configured; skipping "${message.subject}" to ${message.to}.\n${message.text ?? ""}`,
    );
    return;
  }

  await transport.sendMail({
    from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}

export function publicSiteUrl(): string {
  return (process.env.PUBLIC_SITE_URL ?? "http://localhost:8080").replace(/\/$/, "");
}
