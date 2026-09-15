import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { createDb } from '../../../db'
import { galleryItems } from '../../../db/schema'
import { isRoot } from '../../../server/admin'
import { createAuth } from '../../../server/auth'
import { getOrCreateCreator } from '../../../server/creator'
import { deleteMedia, getS3Settings, uploadMedia } from '../../../server/media'

async function rootUser(request: Request) {
  const session = await createAuth().api.getSession({ headers: request.headers })
  return session?.user && await isRoot(session.user.id) ? session.user : null
}

export const GET: APIRoute = async ({ request }) => {
  const user = await rootUser(request)
  if (!user) return new Response('Unauthorized', { status: 401 })
  return Response.json({ configured: Boolean(await getS3Settings(env.DB)) })
}

export const POST: APIRoute = async ({ request }) => {
  const user = await rootUser(request)
  if (!user) return new Response('Unauthorized', { status: 401 })

  const uploaded: Array<{ mediaId: string; url: string }> = []
  try {
    const form = await request.formData()
    const title = typeof form.get('title') === 'string' ? String(form.get('title')).trim() : ''
    const description = typeof form.get('description') === 'string' ? String(form.get('description')).trim() : ''
    const status = form.get('status') === 'published' ? 'published' : 'draft'
    const files = form.getAll('images').filter((item): item is File => item instanceof File)
    if (!title || title.length > 160) return Response.json({ error: 'Enter an album title.' }, { status: 400 })
    if (!files.length || files.length > 8) return Response.json({ error: 'Choose between 1 and 8 images.' }, { status: 400 })
    if (files.some((file) => !file.type.startsWith('image/'))) return Response.json({ error: 'Only image files can be added to an album.' }, { status: 400 })
    if (!(await getS3Settings(env.DB))) return Response.json({ error: 'Configure S3 storage before uploading images.' }, { status: 400 })

    for (const file of files) {
      const media = await uploadMedia(env.DB, file, 'gallery', user.id)
      uploaded.push({ mediaId: media.id, url: media.publicUrl })
    }

    const creator = await getOrCreateCreator(user)
    const albumId = crypto.randomUUID()
    const now = new Date()
    const rows = await createDb(env.DB).insert(galleryItems).values(uploaded.map((item, index) => ({
      id: crypto.randomUUID(),
      creatorId: creator.id,
      albumId,
      title,
      description: description || null,
      imageUrl: item.url,
      linkUrl: null,
      status,
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
    }))).returning()
    return Response.json({ albumId, status, items: rows }, { status: 201 })
  } catch (error) {
    console.error('Gallery album creation failed', error)
    for (const item of uploaded) {
      try { await deleteMedia(env.DB, item.mediaId) } catch (cleanupError) { console.error('Gallery upload cleanup failed', cleanupError) }
    }
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to create album.' }, { status: 400 })
  }
}
