import { WorkerMailer } from 'worker-mailer';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { notificationDeliveries, smtpSettings } from '../db/schema';
import { eq } from 'drizzle-orm';

export type SmtpMailer = Awaited<ReturnType<typeof WorkerMailer.connect>>;

export async function connectMailer() {
  const db = createDb(env.DB);
  const [settings] = await db.select().from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1);
  if (!settings?.enabled || !settings.host || !settings.fromAddress || !settings.password) throw new Error('Email delivery is not configured.');
  const mailer = await WorkerMailer.connect({ host: settings.host, port: settings.port, secure: settings.secure && settings.port === 465, startTls: settings.port !== 465, credentials: { username: settings.username, password: settings.password }, authType: ['plain', 'login'], socketTimeoutMs: 10000, responseTimeoutMs: 10000 });
  return { mailer, from: { name: 'FreeCoffee.bio', email: settings.fromAddress }, replyTo: settings.replyTo || undefined };
}

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string; referenceId?: string }) {
  const connection = await connectMailer();
  try {
    await connection.mailer.send({ from: connection.from, to: input.to, reply: connection.replyTo, subject: input.subject, text: input.text, html: input.html });
  } finally {
    await connection.mailer.close();
  }
  return { sent: true, referenceId: input.referenceId };
}

export async function sendTestEmail(to: string) {
  const db = createDb(env.DB);
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(notificationDeliveries).values({ id, recipient: to, template: 'smtp-test', referenceId: null, status: 'pending', attempts: 0, createdAt: now, updatedAt: now });
  try {
    const result = await sendEmail({ to, subject: 'FreeCoffee.bio SMTP test', text: 'Your FreeCoffee.bio email delivery configuration is working.', html: '<p>Your FreeCoffee.bio email delivery configuration is working.</p>' });
    await db.update(notificationDeliveries).set({ status: 'sent', attempts: 1, sentAt: new Date(), updatedAt: new Date() }).where(eq(notificationDeliveries.id, id));
    return result;
  } catch (error) {
    await db.update(notificationDeliveries).set({ status: 'failed', attempts: 1, lastError: error instanceof Error ? error.message : String(error), updatedAt: new Date() }).where(eq(notificationDeliveries.id, id));
    throw error;
  }
}
