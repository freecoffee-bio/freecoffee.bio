import type { APIRoute } from 'astro'
import { and, eq } from 'drizzle-orm'
import { env } from 'cloudflare:workers'
import { createDb } from '../../../db'
import { creatorProfiles, mediaFiles } from '../../../db/schema'
import { isRoot } from '../../../server/admin'
import { createAuth } from '../../../server/auth'
import { getOrCreateCreator } from '../../../server/creator'
import { deleteMedia, uploadMedia } from '../../../server/media'

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const maxAvatarSize = 5 * 1024 * 1024

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
    if (!(file instanceof File)) return Response.json({ error: 'Choose an image file.' }, { status: 400 })
    if (!allowedImageTypes.has(file.type)) return Response.json({ error: 'Choose a PNG, JPEG, WebP, or GIF image.' }, { status: 400 })
    if (file.size < 1 || file.size > maxAvatarSize) return Response.json({ error: 'Choose an image up to 5 MB.' }, { status: 400 })

    const db = createDb(env.DB)
    const creator = await getOrCreateCreator(user)
    const previousImage = creator.image
    const media = await uploadMedia(env.DB, file, 'avatars', user.id)
    await db.update(creatorProfiles).set({ image: media.publicUrl, updatedAt: new Date() }).where(eq(creatorProfiles.id, creator.id))

    if (previousImage) {
      const [previousMedia] = await db.select({ id: mediaFiles.id }).from(mediaFiles).where(and(eq(mediaFiles.publicUrl, previousImage), eq(mediaFiles.folder, 'avatars'), eq(mediaFiles.uploadedBy, user.id))).limit(1)
      if (previousMedia) {
        try {
          await deleteMedia(env.DB, previousMedia.id)
        } catch (error) {
          console.error('Previous avatar cleanup failed', error)
        }
      }
    }

    return Response.json({ image: media.publicUrl }, { status: 201 })
  } catch (error) {
    console.error('Avatar upload failed', error)
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to upload avatar.' }, { status: 400 })
  }
}
