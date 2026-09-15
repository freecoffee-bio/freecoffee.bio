import type { APIRoute } from 'astro';
import { and, asc, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../../../db';
import { creatorIntegrations, creatorProfiles } from '../../../db/schema';

function escapeXml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] as string); }

export const GET: APIRoute = async ({ params, url }) => {
  const platform = params.platform?.replace(/\.svg$/, '');
  if (platform !== 'button' && platform !== 'github' && platform !== 'youtube') return new Response('Not Found', { status: 404 });
  const handle = url.searchParams.get('creator')?.trim();
  const db = createDb(env.DB);
  const [creator] = handle ? await db.select().from(creatorProfiles).where(eq(creatorProfiles.handle, handle)).limit(1) : await db.select().from(creatorProfiles).orderBy(asc(creatorProfiles.id)).limit(1);
  if (!creator) return new Response('Not Found', { status: 404 });
  const [integration] = await db.select().from(creatorIntegrations).where(and(eq(creatorIntegrations.creatorId, creator.id), eq(creatorIntegrations.platform, platform))).limit(1);

  if (integration?.enabled === false) return new Response('Not Found', { status: 404 });
  const text = escapeXml(integration?.buttonText || 'Support me on FreeCoffee');
  const dark = integration?.theme === 'dark';
  const background = dark ? '#24292f' : (integration?.color || '#72a4f2');
  const foreground = dark ? '#ffffff' : (integration?.textColor || '#172b4d');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(190, text.length * 7 + 64)}" height="36" role="img" aria-label="${text}"><rect width="100%" height="36" rx="8" fill="${background}"/><circle cx="22" cy="18" r="11" fill="#ffffff"/><path d="M16 17c0-3 2-5 5-5 1 0 2 .5 3 1.5 1-1 2-1.5 3-1.5 3 0 5 2 5 5 0 5-5 7-8 9-3-2-8-4-8-9Z" fill="#f06424" transform="translate(-2 -1) scale(.75)"/><text x="40" y="23" fill="${foreground}" font-family="Arial,sans-serif" font-size="14" font-weight="700">${text}</text></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
};
