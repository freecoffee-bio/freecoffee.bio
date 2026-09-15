import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'

import { getSecurityStatus } from '../../server/security'

export const GET: APIRoute = async () => Response.json((await getSecurityStatus(env.DB)).turnstile)
