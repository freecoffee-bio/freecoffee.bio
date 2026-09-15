import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { notificationDeliveries } from '../db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from './email-delivery';

export { sendEmail } from './email-delivery';

export async function sendTestEmail(to: string) {
  const db = createDb(env.DB);
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(notificationDeliveries).values({ id, channel: 'email', recipient: to, template: 'email-test', referenceId: null, status: 'processing', attempts: 0, lockedAt: now, createdAt: now, updatedAt: now });
  try {
    const result = await sendEmail({ to, subject: 'FreeCoffee.bio email test', text: 'Your FreeCoffee.bio email delivery configuration is working.', html: '<p>Your FreeCoffee.bio email delivery configuration is working.</p>' });
    await db.update(notificationDeliveries).set({ status: 'sent', attempts: 1, sentAt: new Date(), lockedAt: null, updatedAt: new Date() }).where(eq(notificationDeliveries.id, id));
    return result;
  } catch (error) {
    await db.update(notificationDeliveries).set({ status: 'failed', attempts: 1, lastError: error instanceof Error ? error.message : String(error), lockedAt: null, updatedAt: new Date() }).where(eq(notificationDeliveries.id, id));
    throw error;
  }
}
