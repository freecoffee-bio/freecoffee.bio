import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { getMediaByKey } from '../../../../server/media'
import { createS3Client, objectUrl, safeObjectKey } from '../../../../server/s3'
import { getS3Settings } from '../../../../server/media'

export const GET: APIRoute = async ({ params, request }) => {
  const key = safeObjectKey(params.key ?? '')
  if (!key || new URL(request.url).search) return new Response('Not Found', { status: 404 })

  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : null
  const cacheRequest = new Request(new URL(request.url).toString(), { method: 'GET' })
  if (cache) {
    const cached = await cache.match(cacheRequest)
    if (cached) return cached
  }

  const record = await getMediaByKey(env.DB, key)
  if (!record) return new Response('Not Found', { status: 404 })
  const settings = await getS3Settings(env.DB)
  if (!settings) return new Response('Not Found', { status: 404 })
  const upstream = await createS3Client(settings).fetch(objectUrl(settings, key), { method: 'GET' })
  if (upstream.status === 404) return new Response('Not Found', { status: 404 })
  if (!upstream.ok) return new Response('Bad Gateway', { status: 502 })
  const headers = new Headers({ 'content-type': record.mimeType, 'cache-control': 'public, max-age=31536000, immutable', 'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(record.originalName)}`, 'x-content-type-options': 'nosniff' })
  const length = upstream.headers.get('content-length')
  if (length) headers.set('content-length', length)
  const etag = upstream.headers.get('etag')
  if (etag) headers.set('etag', etag)
  const response = new Response(upstream.body, { status: 200, headers })
  if (cache) {
    try { await cache.put(cacheRequest, response.clone()) } catch { /* Cache 不可用时仍返回 S3 内容。 */ }
  }
  return response
}
