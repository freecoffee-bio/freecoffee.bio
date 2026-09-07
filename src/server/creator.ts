import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { getPaymentSettings } from './payments';
import { creatorPageSettings, creatorPaymentAccounts, creatorProfiles, creatorCryptoWallets, galleryItems, posts, products as productsTable, smtpSettings, siteSettings, supportTransactions } from '../db/schema';

function slugify(value: string) {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.slice(0, 40) || 'creator';
}

export async function getPublicCreator(handle: string, includeDrafts = false) {
  const db = createDb(env.DB);
  const [creator] = await db.select().from(creatorProfiles).where(eq(creatorProfiles.handle, handle.toLowerCase())).limit(1);
  if (!creator) return null;
  const [page, products, gallery, publishedPosts, supporters, supportTotal, settings] = await Promise.all([
    db.select().from(creatorPageSettings).where(eq(creatorPageSettings.creatorId, creator.id)).limit(1),
    db.select().from(productsTable).where(and(eq(productsTable.creatorId, creator.id), eq(productsTable.status, 'published'))),
    db.select().from(galleryItems).where(includeDrafts ? eq(galleryItems.creatorId, creator.id) : and(eq(galleryItems.creatorId, creator.id), eq(galleryItems.status, 'published'))).orderBy(galleryItems.sortOrder),
    db.select().from(posts).where(includeDrafts ? eq(posts.creatorId, creator.id) : and(eq(posts.creatorId, creator.id), eq(posts.status, 'published'))).orderBy(desc(posts.publishedAt)), 
    db.select({ name: supportTransactions.displayName, message: supportTransactions.message, amount: supportTransactions.amount, createdAt: supportTransactions.createdAt, anonymous: supportTransactions.anonymous }).from(supportTransactions).where(and(eq(supportTransactions.creatorId, creator.id), eq(supportTransactions.status, 'paid'))).orderBy(desc(supportTransactions.createdAt)).limit(10),
    db.select({ amount: sql<number>`coalesce(sum(${supportTransactions.amount}), 0)` }).from(supportTransactions).where(and(eq(supportTransactions.creatorId, creator.id), eq(supportTransactions.status, 'paid'))),
    db.select({ currency: siteSettings.currency }).from(siteSettings).where(eq(siteSettings.id, 1)).limit(1),

  ]);
  return {
    creator,
    page: page[0] ?? null,
    products,
    gallery,
    posts: publishedPosts,
    supporters,
    supportGoal: page[0]?.supportGoalAmount && page[0].supportGoalAmount > 0 ? {
      enabled: page[0].supportGoalEnabled,
      title: page[0].supportGoalTitle || 'Support goal',
      amount: page[0].supportGoalAmount,
      description: page[0].supportGoalDescription,
      raised: supportTotal[0]?.amount ?? 0,
    } : null,
    currency: settings[0]?.currency ?? 'USD',
    paymentProviders: {
      stripe: Boolean((await getPaymentSettings()).stripeSecretKey && (await getPaymentSettings()).stripeWebhookSecret),
      paypal: Boolean((await getPaymentSettings()).paypalClientId && (await getPaymentSettings()).paypalClientSecret && (await getPaymentSettings()).paypalWebhookId),
    },
  };
}

export async function getDefaultPublicCreator(includeDrafts = false) {
  const db = createDb(env.DB);
  const [creator] = await db.select({ handle: creatorProfiles.handle }).from(creatorProfiles).orderBy(asc(creatorProfiles.id)).limit(1);
  return creator ? getPublicCreator(creator.handle, includeDrafts) : null;
}

export async function getOrCreateCreator(user: { id: string; name: string }) {
  const db = createDb(env.DB);
  const existing = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, user.id)).limit(1);
  if (existing[0]) return existing[0];

  const baseHandle = slugify(user.name);
  let handle = baseHandle;
  for (let suffix = 2; ; suffix += 1) {
    const conflict = await db.select({ id: creatorProfiles.id }).from(creatorProfiles).where(eq(creatorProfiles.handle, handle)).limit(1);
    if (!conflict[0]) break;
    handle = `${baseHandle}-${suffix}`.slice(0, 50);
  }

  const now = new Date();
  const [creator] = await db.insert(creatorProfiles).values({
    userId: user.id,
    handle,
    displayName: user.name,
    createdAt: now,
    updatedAt: now,
  }).returning();
  await db.insert(creatorPageSettings).values({ creatorId: creator.id, updatedAt: now });
  return creator;
}

export async function getCreatorWorkspace(user: { id: string; name: string }) {
  const db = createDb(env.DB);
  const creator = await getOrCreateCreator(user);
  const [page, paymentAccounts, wallets, email] = await Promise.all([
    db.select().from(creatorPageSettings).where(eq(creatorPageSettings.creatorId, creator.id)).limit(1),
    db.select({ provider: creatorPaymentAccounts.provider, status: creatorPaymentAccounts.status, externalAccountId: creatorPaymentAccounts.externalAccountId }).from(creatorPaymentAccounts).where(eq(creatorPaymentAccounts.creatorId, creator.id)),
    db.select().from(creatorCryptoWallets).where(eq(creatorCryptoWallets.creatorId, creator.id)),
    db.select({ id: smtpSettings.id, host: smtpSettings.host, port: smtpSettings.port, username: smtpSettings.username, secure: smtpSettings.secure, fromAddress: smtpSettings.fromAddress, replyTo: smtpSettings.replyTo, enabled: smtpSettings.enabled }).from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1),
  ]);
  return { creator, page: page[0] ?? null, paymentAccounts, wallets, email: email[0] ?? null };
}

export async function updateCreatorProfile(user: { id: string; name: string }, input: { handle: string; displayName: string; bio?: string; website?: string; image?: string; socialLinks?: string }) {
  const db = createDb(env.DB);
  const creator = await getOrCreateCreator(user);
  const handle = input.handle.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/.test(handle)) throw new Error('Use 2–50 lowercase letters, numbers, or hyphens for your username.');
  const conflict = await db.select({ id: creatorProfiles.id }).from(creatorProfiles).where(and(eq(creatorProfiles.handle, handle), eq(creatorProfiles.id, creator.id))).limit(1);
  const other = await db.select({ id: creatorProfiles.id }).from(creatorProfiles).where(eq(creatorProfiles.handle, handle)).limit(1);
  if (other[0] && !conflict[0]) throw new Error('That username is already in use.');
  const [updated] = await db.update(creatorProfiles).set({ handle, displayName: input.displayName.trim(), bio: input.bio?.trim() || null, website: input.website?.trim() || null, image: input.image?.trim() || null, socialLinks: input.socialLinks?.trim() || null, updatedAt: new Date() }).where(eq(creatorProfiles.id, creator.id)).returning();
  return updated;
}

export async function updatePageSettings(user: { id: string; name: string }, input: Partial<typeof creatorPageSettings.$inferInsert>) {
  const db = createDb(env.DB);
  const creator = await getOrCreateCreator(user);
  const values = { ...input, creatorId: creator.id, updatedAt: new Date() };
  await db.insert(creatorPageSettings).values(values).onConflictDoUpdate({ target: creatorPageSettings.creatorId, set: values });
}

export async function updatePaymentAccount(user: { id: string; name: string }, provider: string, status: string) {
  const db = createDb(env.DB);
  const creator = await getOrCreateCreator(user);
  const now = new Date();
  await db.insert(creatorPaymentAccounts).values({ id: crypto.randomUUID(), creatorId: creator.id, provider, status, updatedAt: now, connectedAt: status === 'connected' ? now : null }).onConflictDoUpdate({ target: [creatorPaymentAccounts.creatorId, creatorPaymentAccounts.provider], set: { status, updatedAt: now, connectedAt: status === 'connected' ? now : null } });
}

export async function updateSmtpSettings(input: { host: string; port: number; username: string; password?: string; secure: boolean; fromAddress: string; replyTo?: string; enabled: boolean }) {
  const db = createDb(env.DB);
  const existing = await db.select({ password: smtpSettings.password }).from(smtpSettings).where(eq(smtpSettings.id, 1)).limit(1);
  const password = input.password || existing[0]?.password || '';
  await db.insert(smtpSettings).values({ id: 1, ...input, password, updatedAt: new Date() }).onConflictDoUpdate({ target: smtpSettings.id, set: { ...input, password, updatedAt: new Date() } });
}
