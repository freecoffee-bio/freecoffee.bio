import { and, desc, eq } from 'drizzle-orm'
import { createDb } from '../db'
import { mediaFiles, s3StorageSettings } from '../db/schema'
import { createS3Client, normalizeS3Settings, objectUrl, publicMediaUrl, type S3Settings } from './s3'

function cleanName(name: string) {
  const value = name.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  return value.slice(0, 180) || 'file'
}

function cleanFolder(folder: string | undefined) {
  const value = (folder ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!value) return ''
  if (value.split('/').some((part) => !part || part === '..') || value.length > 120) throw new Error('Invalid folder.')
  return value
}

export async function getS3Settings(database: D1Database) {
  const [record] = await createDb(database).select().from(s3StorageSettings).where(eq(s3StorageSettings.id, 1)).limit(1)
  if (!record) return null
  return normalizeS3Settings(record as unknown as Record<string, unknown>)
}

export async function getS3Status(database: D1Database) {
  const [record] = await createDb(database).select().from(s3StorageSettings).where(eq(s3StorageSettings.id, 1)).limit(1)
  return record ? { configured: true, endpoint: record.endpoint, region: record.region, bucket: record.bucket, pathPrefix: record.pathPrefix, forcePathStyle: record.forcePathStyle, accessKeyConfigured: Boolean(record.accessKeyId), secretKeyConfigured: Boolean(record.secretAccessKey), updatedAt: record.updatedAt.toISOString() } : { configured: false, endpoint: '', region: 'us-east-1', bucket: '', pathPrefix: 'media', forcePathStyle: false, accessKeyConfigured: false, secretKeyConfigured: false, updatedAt: null }
}

export async function saveS3Settings(database: D1Database, input: Record<string, unknown>) {
  const existing = await getS3Settings(database)
  const settings = normalizeS3Settings(input, existing)
  const now = new Date()
  await createDb(database).insert(s3StorageSettings).values({ id: 1, endpoint: settings.endpoint, region: settings.region, bucket: settings.bucket, pathPrefix: settings.pathPrefix, accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey, forcePathStyle: settings.forcePathStyle, updatedAt: now }).onConflictDoUpdate({ target: s3StorageSettings.id, set: { endpoint: settings.endpoint, region: settings.region, bucket: settings.bucket, pathPrefix: settings.pathPrefix, accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey, forcePathStyle: settings.forcePathStyle, updatedAt: now } })
  return getS3Status(database)
}

export async function testS3Settings(database: D1Database, input: Record<string, unknown>) {
  const existing = await getS3Settings(database)
  const settings = normalizeS3Settings(input, existing)
  const client = createS3Client(settings)
  const key = `${settings.pathPrefix}/.probe/${crypto.randomUUID()}`
  const url = objectUrl(settings, key)
  const put = await client.fetch(url, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: 'freecoffee-s3-probe' })
  const del = await client.fetch(url, { method: 'DELETE' })
  if (!put.ok || !del.ok && del.status !== 404) throw new Error('S3 connection test failed.')
  return { ok: true }
}

export async function listMedia(database: D1Database) {
  return createDb(database).select().from(mediaFiles).orderBy(desc(mediaFiles.createdAt)).limit(200)
}

export async function uploadMedia(database: D1Database, file: File, folder: string | undefined, uploadedBy: string) {
  if (!(file instanceof File) || file.size < 1 || file.size > 100 * 1024 * 1024) throw new Error('Choose a file up to 100 MB.')
  const settings = await getS3Settings(database)
  if (!settings) throw new Error('Configure S3 storage first.')
  const safeFolder = cleanFolder(folder)
  const fileName = cleanName(file.name)
  const id = crypto.randomUUID()
  const key = [settings.pathPrefix, safeFolder, `${id}-${fileName}`].filter(Boolean).join('/')
  const response = await createS3Client(settings).fetch(objectUrl(settings, key), { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream', 'content-length': String(file.size), 'content-disposition': `inline; filename="${fileName}"` }, body: file.stream() })
  if (!response.ok) throw new Error('Unable to upload file to S3.')
  const now = new Date()
  try {
    const [row] = await createDb(database).insert(mediaFiles).values({ id, originalName: file.name, objectKey: key, mimeType: file.type || 'application/octet-stream', fileSize: file.size, folder: safeFolder || null, publicUrl: publicMediaUrl(key), uploadedBy, createdAt: now }).returning()
    return row
  } catch (error) {
    await createS3Client(settings).fetch(objectUrl(settings, key), { method: 'DELETE' })
    throw error
  }
}

export async function deleteMedia(database: D1Database, id: string) {
  const [row] = await createDb(database).select().from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1)
  if (!row) throw new Error('File not found.')
  const settings = await getS3Settings(database)
  if (!settings) throw new Error('Configure S3 storage first.')
  const response = await createS3Client(settings).fetch(objectUrl(settings, row.objectKey), { method: 'DELETE' })
  if (!response.ok && response.status !== 404) throw new Error('Unable to delete file from S3.')
  await createDb(database).delete(mediaFiles).where(eq(mediaFiles.id, id))
  return { id }
}

export async function getMediaByKey(database: D1Database, key: string) {
  const [row] = await createDb(database).select().from(mediaFiles).where(and(eq(mediaFiles.objectKey, key))).limit(1)
  return row ?? null
}

export type { S3Settings }
