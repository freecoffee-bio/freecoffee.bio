import type { APIRoute } from 'astro'
import { and, eq } from 'drizzle-orm'
import { env } from 'cloudflare:workers'
import { createDb } from '../../../db'
import { creatorPageSettings, mediaFiles } from '../../../db/schema'
import { isRoot } from '../../../server/admin'
import { createAuth } from '../../../server/auth'
import { getOrCreateCreator } from '../../../server/creator'
import { deleteMedia, uploadMedia } from '../../../server/media'

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const maxCoverSize = 10 * 1024 * 1024

async function rootUser(request: Request) {
  const session = await createAuth().api.getSession({ headers: request.headers })
  return session?.user && await isRoot(session.user.id) ? session.user : null
}

export const POST: APIRoute = async ({ request }) => {
  const user = await rootUser(request)
  if (!user) return new Response('Unauthorized', { status: 401 })
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return Response.json({ error: 'Choose a cover image.' }, { status: 400 })
    if (!allowedImageTypes.has(file.type)) return Response.json({ error: 'Choose a PNG, JPEG, WebP, or GIF image.' }, { status: 400 })
    if (file.size < 1 || file.size > maxCoverSize) return Response.json({ error: 'Choose an image up to 10 MB.' }, { status: 400 })

    const db = createDb(env.DB)
    const creator = await getOrCreateCreator(user)
    const [settings] = await db.select({ coverImageUrl: creatorPageSettings.coverImageUrl }).from(creatorPageSettings).where(eq(creatorPageSettings.creatorId, creator.id)).limit(1)
    const media = await uploadMedia(env.DB, file, 'covers', user.id)
    const now = new Date()
    await db.insert(creatorPageSettings).values({ creatorId: creator.id, coverImageUrl: media.publicUrl, updatedAt: now }).onConflictDoUpdate({ target: creatorPageSettings.creatorId, set: { coverImageUrl: media.publicUrl, updatedAt: now } })
    if (settings?.coverImageUrl) {
      const [previousMedia] = await db.select({ id: mediaFiles.id }).from(mediaFiles).where(and(eq(mediaFiles.publicUrl, settings.coverImageUrl), eq(mediaFiles.folder, 'covers'), eq(mediaFiles.uploadedBy, user.id))).limit(1)
      if (previousMedia) {
        try { await deleteMedia(env.DB, previousMedia.id) } catch (error) { console.error('Previous cover cleanup failed', error) }
      }
    }
    return Response.json({ image: media.publicUrl })
  } catch (error) {
    console.error('Cover upload failed', error)
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to upload cover image.' }, { status: 400 })
  }
}
