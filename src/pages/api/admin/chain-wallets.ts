import type { APIRoute } from 'astro';
import { createAuth } from '../../../server/auth';
import { isRoot } from '../../../server/admin';
import { getOrCreateCreator } from '../../../server/creator';
import { disableBaseUsdcWallet, saveBaseUsdcWallet } from '../../../server/base-usdc';
import { disableSolanaWallet, saveSolanaWallet } from '../../../server/solana-spl';

export const POST: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const provider = body.provider;
    if (provider !== 'base-usdc' && provider !== 'solana-usdc' && provider !== 'solana-usdt') throw new Error('Choose a supported chain payment provider.');
    const creator = await getOrCreateCreator(session.user);
    if (body.action === 'disconnect') {
      if (provider === 'base-usdc') await disableBaseUsdcWallet(creator.id);
      else await disableSolanaWallet(creator.id, provider === 'solana-usdc' ? 'USDC' : 'USDT');
      return Response.json({ ok: true });
    }
    const input = {
      address: typeof body.address === 'string' ? body.address : '',
      rpcUrl: typeof body.rpcUrl === 'string' ? body.rpcUrl : '',
      requiredConfirmations: body.requiredConfirmations,
    };
    if (provider === 'base-usdc') await saveBaseUsdcWallet(creator.id, input);
    else await saveSolanaWallet(creator.id, provider === 'solana-usdc' ? 'USDC' : 'USDT', input);
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Chain wallet settings update failed', error);
    const message = error instanceof Error ? error.message : '';
    const safeMessage = /address|RPC|confirmations|commitment|mainnet|supported chain payment provider/i.test(message) ? message : 'Unable to save chain wallet settings.';
    return Response.json({ error: safeMessage }, { status: 400 });
  }
};
