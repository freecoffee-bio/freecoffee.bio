import type { APIRoute } from 'astro';
import { createAuth } from '../../../server/auth';
import { isRoot } from '../../../server/admin';
import { getOrCreateCreator } from '../../../server/creator';
import { disableBaseUsdcWallet, saveBaseUsdcWallet } from '../../../server/base-usdc';

export const POST: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const creator = await getOrCreateCreator(session.user);
    if (body.action === 'disconnect') {
      await disableBaseUsdcWallet(creator.id);
      return Response.json({ ok: true });
    }
    await saveBaseUsdcWallet(creator.id, {
      address: typeof body.address === 'string' ? body.address : '',
      rpcUrl: typeof body.rpcUrl === 'string' ? body.rpcUrl : '',
      requiredConfirmations: body.requiredConfirmations,
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Base USDC settings update failed', error);
    const message = error instanceof Error ? error.message : '';
    const safeMessage = /wallet address|RPC URL|confirmations|Base mainnet|Base RPC/i.test(message) ? message : 'Unable to save Base USDC settings.';
    return Response.json({ error: safeMessage }, { status: 400 });
  }
};
