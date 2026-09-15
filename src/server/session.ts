import { createAuth } from './auth';
import { isRoot } from './admin';

export async function getCurrentUser(request: Request) {
  const session = await createAuth().api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

export async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  return user;
}

export async function requireRoot(request: Request) {
  const user = await requireUser(request);
  if (!(await isRoot(user.id))) throw new Response('Forbidden', { status: 403 });
  return user;
}
