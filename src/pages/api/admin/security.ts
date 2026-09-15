import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'

import { createAuth } from '../../../server/auth'
import { isRoot } from '../../../server/admin'
import { getSecurityStatus, saveSecuritySettings } from '../../../server/security'

export const GET: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers })
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 })

  return Response.json({ ...(await getSecurityStatus(env.DB)), twoFactorEnabled: session.user.twoFactorEnabled ?? false })
}

export const POST: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers })
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 })

  try {
    const body = await request.json() as { turnstileEnabled?: unknown; turnstileSiteKey?: unknown; turnstileSecretKey?: unknown }
    return Response.json(await saveSecuritySettings(env.DB, body))
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to save security settings.' }, { status: 400 })
  }
}
