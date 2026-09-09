import { eq } from 'drizzle-orm'

import { createDb } from '../db'
import { securitySettings } from '../db/schema'

export type SecurityStatus = {
  turnstile: {
    enabled: boolean
    siteKey: string
    siteKeyConfigured: boolean
    secretKeyConfigured: boolean
  }
}

function status(settings?: typeof securitySettings.$inferSelect): SecurityStatus {
  const siteKey = settings?.turnstileSiteKey ?? ''
  const secretKey = settings?.turnstileSecretKey ?? ''
  return {
    turnstile: {
      enabled: Boolean(settings?.turnstileEnabled && siteKey && secretKey),
      siteKey,
      siteKeyConfigured: Boolean(siteKey),
      secretKeyConfigured: Boolean(secretKey),
    },
  }
}

export async function getSecurityStatus(database: D1Database): Promise<SecurityStatus> {
  const [settings] = await createDb(database).select().from(securitySettings).where(eq(securitySettings.id, 1)).limit(1)
  return status(settings)
}

export async function saveSecuritySettings(database: D1Database, input: { turnstileEnabled?: unknown; turnstileSiteKey?: unknown; turnstileSecretKey?: unknown }) {
  const existing = await getSecurityStatus(database)
  const siteKey = typeof input.turnstileSiteKey === 'string' ? input.turnstileSiteKey.trim() : ''
  const submittedSecret = typeof input.turnstileSecretKey === 'string' ? input.turnstileSecretKey.trim() : ''
  const secretKey = submittedSecret || (existing.turnstile.secretKeyConfigured ? (await createDb(database).select({ secretKey: securitySettings.turnstileSecretKey }).from(securitySettings).where(eq(securitySettings.id, 1)).limit(1))[0]?.secretKey ?? '' : '')
  const enabled = input.turnstileEnabled === true

  if ((siteKey.length > 500 || secretKey.length > 500) || (enabled && (!siteKey || !secretKey))) throw new Error('Enter both a Turnstile site key and secret key before enabling Turnstile.')

  const db = createDb(database)
  const now = new Date()
  const values = { turnstileEnabled: enabled, turnstileSiteKey: siteKey, turnstileSecretKey: secretKey, updatedAt: now }
  const [stored] = await db.select({ id: securitySettings.id }).from(securitySettings).where(eq(securitySettings.id, 1)).limit(1)
  if (stored) await db.update(securitySettings).set(values).where(eq(securitySettings.id, 1))
  else await db.insert(securitySettings).values({ id: 1, ...values })
  return getSecurityStatus(database)
}

export async function verifyTurnstile(request: Request, database: D1Database) {
  const { turnstile } = await getSecurityStatus(database)
  if (!turnstile.enabled) return

  const token = request.headers.get('x-captcha-response')
  if (!token) throw new Response(JSON.stringify({ message: 'Complete the Turnstile challenge and try again.' }), { status: 400, headers: { 'content-type': 'application/json' } })

  const remoteip = request.headers.get('CF-Connecting-IP')
  const body = new FormData()
  body.set('secret', (await createDb(database).select({ secretKey: securitySettings.turnstileSecretKey }).from(securitySettings).where(eq(securitySettings.id, 1)).limit(1))[0]?.secretKey ?? '')
  body.set('response', token)
  if (remoteip) body.set('remoteip', remoteip)

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(10_000) })
  const result = await response.json().catch(() => null) as { success?: boolean } | null
  if (!response.ok || result?.success !== true) throw new Response(JSON.stringify({ message: 'Turnstile verification failed. Please try again.' }), { status: 400, headers: { 'content-type': 'application/json' } })
}
