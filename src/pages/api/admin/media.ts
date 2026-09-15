import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { createAuth } from '../../../server/auth'
import { isRoot } from '../../../server/admin'
import { requestId } from '../../../server/http'
import { deleteMedia, getS3Status, listMedia, saveS3Settings, testS3Settings, uploadMedia } from '../../../server/media'

async function user(request: Request) {
  const session = await createAuth().api.getSession({ headers: request.headers })
  return session?.user && await isRoot(session.user.id) ? session.user : null
}

export const GET: APIRoute = async ({ request }) => {
  const currentUser = await user(request)
  if (!currentUser) return new Response('Unauthorized', { status: 401 })
  return Response.json({ storage: await getS3Status(env.DB), files: await listMedia(env.DB) })
}

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request)
  const currentUser = await user(request)
  if (!currentUser) return new Response('Unauthorized', { status: 401 })
  try {
    const body = await request.json() as Record<string, unknown>
    const action = body.action === 'test' ? 'test' : 'save'
    const result = action === 'test' ? await testS3Settings(env.DB, body) : await saveS3Settings(env.DB, body)
    return Response.json(result)
  } catch (error) {
    console.error('S3 settings request failed', { id, error })
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to update S3 storage.', requestId: id }, { status: 400, headers: { 'x-request-id': id } })
  }
}

export const PUT: APIRoute = async ({ request }) => {
  const currentUser = await user(request)
  if (!currentUser) return new Response('Unauthorized', { status: 401 })
  try {
    const form = await request.formData()
    const file = form.get('file')
    const folder = form.get('folder')
    if (!(file instanceof File) || (folder !== null && typeof folder !== 'string')) return Response.json({ error: 'Choose a file.' }, { status: 400 })
    const row = await uploadMedia(env.DB, file, folder ?? undefined, currentUser.id)
    return Response.json({ file: row }, { status: 201 })
  } catch (error) {
    console.error('Media upload failed', error)
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to upload file.' }, { status: 400 })
  }
}

export const DELETE: APIRoute = async ({ request }) => {
  const currentUser = await user(request)
  if (!currentUser) return new Response('Unauthorized', { status: 401 })
  try {
    const body = await request.json() as { id?: unknown }
    if (typeof body.id !== 'string' || !body.id) return Response.json({ error: 'File not found.' }, { status: 404 })
    return Response.json(await deleteMedia(env.DB, body.id))
  } catch (error) {
    console.error('Media deletion failed', error)
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to delete file.' }, { status: 400 })
  }
}
