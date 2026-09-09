import { and, desc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { notificationDeliveries, notificationTemplates } from '../db/schema';
import { sendEmail } from './email-delivery';

export type NotificationTemplate = typeof notificationTemplates.$inferSelect;

export const defaultNotificationTemplates = [
  { eventKey: 'support-receipt', displayName: 'Support payment receipt', description: 'Sent to a supporter after a payment is completed.', subject: 'Your {{siteName}} support receipt', bodyText: 'Thank you for supporting {{siteName}}. Your payment of {{amount}} {{currency}} was confirmed.', bodyHtml: '<p>Thank you for supporting {{siteName}}.</p><p>Your payment of <strong>{{amount}} {{currency}}</strong> was confirmed.</p>' },
  { eventKey: 'creator-support-notification', displayName: 'New support notification', description: 'Sent to the creator when someone sends support.', subject: 'You received support on {{siteName}}', bodyText: '{{supporterName}} sent {{amount}} {{currency}}.', bodyHtml: '<p>{{supporterName}} sent <strong>{{amount}} {{currency}}</strong>.</p>' },
  { eventKey: 'order-receipt', displayName: 'Order payment receipt', description: 'Sent to a buyer after a shop order is paid.', subject: 'Your {{siteName}} purchase', bodyText: 'Your order {{orderId}} was confirmed.\n\nSign in to your account and open My orders to download your purchase.', bodyHtml: '<p>Your order <strong>{{orderId}}</strong> was confirmed.</p><p>Sign in to your account and open My orders to download your purchase.</p>' },
];

const legacyOrderReceipt = {
  bodyText: 'Your order {{orderId}} was confirmed.\n\nSign in to your account and open My orders to download your purchase.\n\n{{downloadLinks}}',
  bodyHtml: '<p>Your order <strong>{{orderId}}</strong> was confirmed.</p><p>Sign in to your account and open My orders to download your purchase.</p><p>{{downloadLinks}}</p>',
};

export async function ensureNotificationTemplates() {
  const db = createDb(env.DB);
  const now = new Date();
  await db.insert(notificationTemplates).values(defaultNotificationTemplates.map((template) => ({ id: template.eventKey, channel: 'email', ...template, enabled: true, createdAt: now, updatedAt: now }))).onConflictDoNothing({ target: [notificationTemplates.eventKey, notificationTemplates.channel] });
  const orderReceipt = defaultNotificationTemplates.find((template) => template.eventKey === 'order-receipt')!;
  await db.update(notificationTemplates).set({ bodyText: orderReceipt.bodyText, bodyHtml: orderReceipt.bodyHtml, updatedAt: now }).where(and(eq(notificationTemplates.eventKey, 'order-receipt'), eq(notificationTemplates.channel, 'email'), eq(notificationTemplates.bodyText, legacyOrderReceipt.bodyText), eq(notificationTemplates.bodyHtml, legacyOrderReceipt.bodyHtml)));
}

export async function listNotificationTemplates() {
  await ensureNotificationTemplates();
  return createDb(env.DB).select().from(notificationTemplates).where(eq(notificationTemplates.channel, 'email')).orderBy(notificationTemplates.displayName);
}

export async function updateNotificationTemplate(id: string, input: Pick<NotificationTemplate, 'displayName' | 'description' | 'subject' | 'bodyText' | 'bodyHtml' | 'enabled'>) {
  await ensureNotificationTemplates();
  const [row] = await createDb(env.DB).update(notificationTemplates).set({ ...input, updatedAt: new Date() }).where(and(eq(notificationTemplates.id, id), eq(notificationTemplates.channel, 'email'))).returning();
  if (!row) throw new Error('Template not found.');
  return row;
}

function render(value: string, data: Record<string, string>) {
  return value.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => data[key] ?? `{{${key}}}`);
}

export async function dispatchEmailNotification(input: { recipient: string; eventKey: string; referenceId?: string; data: Record<string, string> }) {
  await ensureNotificationTemplates();
  const db = createDb(env.DB);
  const dedupeKey = input.referenceId ? `email:${input.eventKey}:${input.referenceId}:${input.recipient.toLowerCase()}` : undefined;
  const id = crypto.randomUUID();
  const now = new Date();
  const inserted = await db.insert(notificationDeliveries).values({ id, channel: 'email', recipient: input.recipient, template: input.eventKey, referenceId: input.referenceId ?? null, dedupeKey, payloadJson: JSON.stringify(input.data), status: 'pending', attempts: 0, availableAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing({ target: notificationDeliveries.dedupeKey }).returning({ id: notificationDeliveries.id });

  return inserted.length > 0;
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const RETRY_DELAYS = [60, 300, 1800, 7200];

export type NotificationBatchResult = {
  candidates: number;
  claimed: number;
  sent: number;
  retriedOrFailed: number;
};

export async function processNotificationBatch(limit = 8): Promise<NotificationBatchResult> {
  const db = createDb(env.DB);
  const now = new Date();

  const stale = new Date(now.getTime() - 10 * 60_000);
  await db.update(notificationDeliveries).set({ status: 'retry', availableAt: now, lockedAt: null, updatedAt: now }).where(and(eq(notificationDeliveries.status, 'processing'), lte(notificationDeliveries.lockedAt, stale)));
  const templates = await db.select().from(notificationTemplates).where(eq(notificationTemplates.channel, 'email'));
  const templateMap = new Map(templates.map((template) => [template.eventKey, template]));
  const candidates = await db.select().from(notificationDeliveries).where(and(eq(notificationDeliveries.channel, 'email'), inArray(notificationDeliveries.status, ['pending', 'retry']), or(isNull(notificationDeliveries.availableAt), lte(notificationDeliveries.availableAt, now)))).orderBy(notificationDeliveries.createdAt).limit(limit);
  if (!candidates.length) return { candidates: 0, claimed: 0, sent: 0, retriedOrFailed: 0 };
  const claimed = [];
  for (const candidate of candidates) {
    const result = await db.update(notificationDeliveries).set({ status: 'processing', lockedAt: now, updatedAt: now }).where(and(eq(notificationDeliveries.id, candidate.id), inArray(notificationDeliveries.status, ['pending', 'retry']))).returning();
    if (result[0]) claimed.push(result[0]);
  }
  if (!claimed.length) return { candidates: candidates.length, claimed: 0, sent: 0, retriedOrFailed: 0 };

  let sent = 0;
  let retriedOrFailed = 0;
  try {
    for (let index = 0; index < claimed.length; index++) {
      const job = claimed[index];
      const template = templateMap.get(job.template);
      try {
        if (!template || !template.enabled) throw new Error(!template ? 'Notification template not found.' : 'Notification template is disabled.');
        const data = job.payloadJson ? JSON.parse(job.payloadJson) as Record<string, string> : {};
        await sendEmail({ to: job.recipient, subject: render(template.subject, data), text: render(template.bodyText, data), html: template.bodyHtml ? render(template.bodyHtml, data) : undefined, referenceId: job.referenceId ?? undefined });
        await db.update(notificationDeliveries).set({ status: 'sent', attempts: job.attempts + 1, sentAt: new Date(), lockedAt: null, updatedAt: new Date() }).where(and(eq(notificationDeliveries.id, job.id), eq(notificationDeliveries.status, 'processing')));
        sent += 1;
      } catch (error) {
        const attempts = job.attempts + 1;
        const retry = attempts <= RETRY_DELAYS.length;
        const errorDetails = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
        console.error('Notification delivery failed', JSON.stringify({ jobId: job.id, template: job.template, recipient: job.recipient, attempt: attempts, retry, error: errorDetails }));
        await db.update(notificationDeliveries).set({ status: retry ? 'retry' : 'failed', attempts, availableAt: retry ? new Date(Date.now() + RETRY_DELAYS[attempts - 1] * 1000) : null, lockedAt: null, lastError: error instanceof Error ? error.message : String(error), updatedAt: new Date() }).where(and(eq(notificationDeliveries.id, job.id), eq(notificationDeliveries.status, 'processing')));
        retriedOrFailed += 1;
      }
      if (index < claimed.length - 1) await wait(6_000);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const retryAt = new Date(Date.now() + RETRY_DELAYS[0] * 1000);
    await db.update(notificationDeliveries).set({ status: 'retry', attempts: 1, availableAt: retryAt, lockedAt: null, lastError: errorMessage, updatedAt: new Date() }).where(and(eq(notificationDeliveries.status, 'processing'), inArray(notificationDeliveries.id, claimed.map((job) => job.id))));
    console.error('Notification batch failed', JSON.stringify({ count: claimed.length, error: errorMessage }));
    throw error;
  }

  return { candidates: candidates.length, claimed: claimed.length, sent, retriedOrFailed };
}

export async function listNotificationDeliveries() {
  return createDb(env.DB).select().from(notificationDeliveries).where(eq(notificationDeliveries.channel, 'email')).orderBy(desc(notificationDeliveries.createdAt)).limit(200);
}
