import type { APIRoute } from 'astro'
import { and, eq } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { env } from 'cloudflare:workers'

import { createDb } from '../../../db'
import { accounts, sessions, users } from '../../../db/schema'
import { isRoot } from '../../../server/admin'
import { createAuth } from '../../../server/auth'

export const POST: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers })
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 })

  let body: { action?: unknown; userId?: unknown; password?: unknown }
  try {
    body = await request.json() as typeof body
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const userId = typeof body.userId === 'string' ? body.userId : ''
  if (!userId) return Response.json({ error: 'User ID is required.' }, { status: 400 })
  if (userId === session.user.id || await isRoot(userId)) return Response.json({ error: 'The root administrator cannot be managed here.' }, { status: 403 })

  const db = createDb(env.DB)
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return Response.json({ error: 'User not found.' }, { status: 404 })

  if (body.action === 'delete') {
    await db.delete(users).where(eq(users.id, userId))
    return Response.json({ ok: true })
  }

  if (body.action === 'reset-password') {
    const password = typeof body.password === 'string' ? body.password : ''
    if (password.length < 8 || password.length > 128) return Response.json({ error: 'Password must be 8–128 characters.' }, { status: 400 })
    const hashed = await hashPassword(password)
    const [credential] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential'))).limit(1)
    if (!credential) return Response.json({ error: 'This user does not have a password login.' }, { status: 400 })
    await db.update(accounts).set({ password: hashed, updatedAt: new Date() }).where(eq(accounts.id, credential.id))
    await db.delete(sessions).where(eq(sessions.userId, userId))
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'Unsupported user action.' }, { status: 400 })
}
