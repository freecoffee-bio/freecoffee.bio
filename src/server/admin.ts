import { eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { adminBootstrap } from '../db/schema';

export async function getRootUserId(): Promise<string | null> {
  const [root] = await createDb(env.DB).select({ userId: adminBootstrap.userId }).from(adminBootstrap).where(eq(adminBootstrap.id, 1)).limit(1);
  return root?.userId ?? null;
}

export async function hasRoot(): Promise<boolean> {
  return (await getRootUserId()) !== null;
}

export async function isRoot(userId: string | undefined): Promise<boolean> {
  return Boolean(userId && (await getRootUserId()) === userId);
}

export async function bindRoot(userId: string): Promise<boolean> {
  const inserted = await createDb(env.DB).insert(adminBootstrap).values({ id: 1, userId, createdAt: new Date() }).onConflictDoNothing().returning({ userId: adminBootstrap.userId });
  return inserted[0]?.userId === userId;
}
