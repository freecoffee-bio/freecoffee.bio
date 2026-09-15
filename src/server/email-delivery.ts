import { WorkerMailer } from 'worker-mailer';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { smtpSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getActiveEmailProviderConfig } from './email-config';

type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  referenceId?: string;
};

type ApiProviderConfig = {
  apiKey: string;
  fromAddress: string;
  fromName?: string;
  replyTo?: string;
};

function sender(config: ApiProviderConfig) {
  return config.fromName ? `${config.fromName} <${config.fromAddress}>` : config.fromAddress;
}

async function readError(response: Response) {
  const body = await response.text();
  return body.slice(0, 500) || response.statusText;
}

async function sendResend(config: ApiProviderConfig, input: EmailInput) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: sender(config), to: [input.to], subject: input.subject, text: input.text, html: input.html, reply_to: config.replyTo || undefined }),
  });
  if (!response.ok) throw new Error(`Resend rejected the email (${response.status}): ${await readError(response)}`);
}

async function sendBrevo(config: ApiProviderConfig, input: EmailInput) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: { email: config.fromAddress, name: config.fromName || undefined }, to: [{ email: input.to }], subject: input.subject, textContent: input.text, htmlContent: input.html, replyTo: config.replyTo ? { email: config.replyTo } : undefined }),
  });
  if (!response.ok) throw new Error(`Brevo rejected the email (${response.status}): ${await readError(response)}`);
}

async function sendSmtp(input: EmailInput) {
  const db = createDb(env.DB);
  const [settings] = await db.select().from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1);
  if (!settings?.host || !settings.fromAddress || !settings.password) throw new Error('SMTP is not configured.');
  const mailer = await WorkerMailer.connect({ host: settings.host, port: settings.port, secure: settings.secure && settings.port === 465, startTls: settings.port !== 465, credentials: { username: settings.username, password: settings.password }, authType: ['plain', 'login'], socketTimeoutMs: 10000, responseTimeoutMs: 10000 });
  try {
    await mailer.send({ from: { name: 'FreeCoffee.bio', email: settings.fromAddress }, to: input.to, reply: settings.replyTo || undefined, subject: input.subject, text: input.text, html: input.html });
  } finally {
    await mailer.close();
  }
}

export async function sendEmail(input: EmailInput) {
  const { activeProvider, providers } = await getActiveEmailProviderConfig();
  if (!activeProvider) throw new Error('Select an active email delivery service.');
  if (activeProvider === 'smtp') {
    await sendSmtp(input);
  } else {
    const config = providers[activeProvider];
    if (!config) throw new Error('The active email provider is not configured.');
    if (activeProvider === 'resend') await sendResend(config, input);
    else await sendBrevo(config, input);
  }
  return { sent: true, referenceId: input.referenceId };
}
