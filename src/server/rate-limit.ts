import { env } from 'cloudflare:workers';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 8;

type RateLimitStore = Pick<KVNamespace, 'get' | 'put'>;

function store(): RateLimitStore | null {
  const bindings = env as unknown as { FREECOFFEE_KV?: KVNamespace };
  return bindings.FREECOFFEE_KV ?? null;
}

export async function enforceRateLimit(request: Request, scope: string, limit = MAX_REQUESTS): Promise<{ allowed: boolean; retryAfter: number }> {
  const kv = store();
  if (!kv) return { allowed: true, retryAfter: 0 };
  const forwarded = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const key = `rate:${scope}:${forwarded.split(',')[0].trim()}`;
  const now = Math.floor(Date.now() / 1000);
  const current = await kv.get<{ count: number; expiresAt: number }>(key, 'json');
  if (!current || current.expiresAt <= now) {
    await kv.put(key, JSON.stringify({ count: 1, expiresAt: now + WINDOW_SECONDS }), { expirationTtl: WINDOW_SECONDS });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= limit) return { allowed: false, retryAfter: Math.max(1, current.expiresAt - now) };
  await kv.put(key, JSON.stringify({ count: current.count + 1, expiresAt: current.expiresAt }), { expirationTtl: Math.max(60, current.expiresAt - now) });
  return { allowed: true, retryAfter: 0 };
}
