import { and, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { creatorIntegrations } from '../db/schema';
import { getOrCreateCreator } from './creator';

export const buttonPlatforms = ['button', 'github', 'youtube'] as const;
export type ButtonPlatform = typeof buttonPlatforms[number];

export type ButtonIntegration = {
  platform: ButtonPlatform;
  enabled: boolean;
  buttonText: string;
  theme: string;
  color: string;
  textColor: string;
  buttonType: string;
};

export async function listButtonIntegrations(user: { id: string; name: string }) {
  const creator = await getOrCreateCreator(user);
  const rows = await createDb(env.DB).select().from(creatorIntegrations).where(eq(creatorIntegrations.creatorId, creator.id));
  return buttonPlatforms.map((platform) => {
    const row = rows.find((item) => item.platform === platform);
    return { platform, enabled: row?.enabled ?? true, buttonText: row?.buttonText ?? 'Support me on FreeCoffee', theme: row?.theme ?? 'light', color: row?.color ?? '#72a4f2', textColor: row?.textColor ?? '#172b4d', buttonType: row?.buttonType ?? 'button' } satisfies ButtonIntegration;
  });
}

export async function updateButtonIntegration(user: { id: string; name: string }, input: { platform: ButtonPlatform; enabled?: boolean; buttonText?: string; theme?: string; color?: string; textColor?: string; buttonType?: string }) {
  const creator = await getOrCreateCreator(user);
  const now = new Date();
  const buttonText = input.buttonText?.trim() || 'Support me on FreeCoffee';
  if (buttonText.length > 80) throw new Error('Button text must be 80 characters or fewer.');
  if (input.theme && !['light', 'dark'].includes(input.theme)) throw new Error('Choose a valid button theme.');
  const color = input.color && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : '#72a4f2';
  const textColor = input.textColor && /^#[0-9a-f]{6}$/i.test(input.textColor) ? input.textColor : '#172b4d';
  const buttonType = input.buttonType === 'image' ? 'image' : 'button';
  await createDb(env.DB).insert(creatorIntegrations).values({ id: crypto.randomUUID(), creatorId: creator.id, platform: input.platform, enabled: input.enabled ?? true, buttonText, theme: input.theme ?? 'light', color, textColor, buttonType, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [creatorIntegrations.creatorId, creatorIntegrations.platform], set: { enabled: input.enabled ?? true, buttonText, theme: input.theme ?? 'light', color, textColor, buttonType, updatedAt: now } });
}

export async function getButtonIntegration(creatorId: number, platform: ButtonPlatform) {
  const [row] = await createDb(env.DB).select().from(creatorIntegrations).where(and(eq(creatorIntegrations.creatorId, creatorId), eq(creatorIntegrations.platform, platform))).limit(1);
  return row;
}
