import { AwsClient } from 'aws4fetch'

export type S3Settings = {
  endpoint: string
  region: string
  bucket: string
  pathPrefix: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

export function normalizeS3Settings(input: Record<string, unknown>, existing?: S3Settings | null): S3Settings {
  const endpoint = typeof input.endpoint === 'string' ? input.endpoint.trim().replace(/\/$/, '') : ''
  const region = typeof input.region === 'string' && input.region.trim() ? input.region.trim() : 'us-east-1'
  const bucket = typeof input.bucket === 'string' ? input.bucket.trim() : ''
  const pathPrefix = typeof input.pathPrefix === 'string' ? input.pathPrefix.trim().replace(/^\/+|\/+$/g, '') : 'media'
  const accessKeyId = typeof input.accessKeyId === 'string' && input.accessKeyId.trim() ? input.accessKeyId.trim() : existing?.accessKeyId ?? ''
  const secretAccessKey = typeof input.secretAccessKey === 'string' && input.secretAccessKey.trim() ? input.secretAccessKey.trim() : existing?.secretAccessKey ?? ''
  if (!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(endpoint) || !bucket || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}$/.test(bucket) || !accessKeyId || !secretAccessKey) throw new Error('Invalid S3 configuration.')
  if (pathPrefix.split('/').some((part) => !part || part === '..') || pathPrefix.length > 120) throw new Error('Invalid storage path prefix.')
  return { endpoint, region, bucket, pathPrefix, accessKeyId, secretAccessKey, forcePathStyle: input.forcePathStyle === true }
}

export function objectUrl(settings: S3Settings, key: string) {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  if (settings.forcePathStyle) return `${settings.endpoint}/${encodeURIComponent(settings.bucket)}/${encodedKey}`
  const url = new URL(settings.endpoint)
  url.hostname = `${settings.bucket}.${url.hostname}`
  url.pathname = `/${encodedKey}`
  return url.toString()
}

export function createS3Client(settings: S3Settings) {
  return new AwsClient({ accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey, region: settings.region, service: 's3' })
}

export function publicMediaUrl(key: string) {
  return `/api/media/proxy/${key.split('/').map(encodeURIComponent).join('/')}`
}

export function safeObjectKey(value: string) {
  let decoded = ''
  try { decoded = value.split('/').map(decodeURIComponent).join('/') } catch { return null }
  if (!decoded || decoded.split('/').some((part) => !part || part === '..' || part.includes('\\'))) return null
  return decoded
}
