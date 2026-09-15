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
    const network = body.network;
    if (network !== 'base' && network !== 'solana') throw new Error('Choose a supported payment network.');
    const creator = await getOrCreateCreator(session.user);
    if (body.action === 'disconnect') {
      if (network === 'base') await disableBaseUsdcWallet(creator.id);
      else await Promise.all([disableSolanaWallet(creator.id, 'USDC'), disableSolanaWallet(creator.id, 'USDT')]);
      return Response.json({ ok: true });
    }
    if (!body.addresses || typeof body.addresses !== 'object') throw new Error('Enter the required wallet addresses.');
    const addresses = body.addresses as Record<string, unknown>;
    const shared = {
      rpcUrl: typeof body.rpcUrl === 'string' ? body.rpcUrl : '',
      requiredConfirmations: body.requiredConfirmations,
    };
    if (network === 'base') {
      await saveBaseUsdcWallet(creator.id, { ...shared, address: typeof addresses.USDC === 'string' ? addresses.USDC : '' });
    } else {
      await saveSolanaWallet(creator.id, {
        USDC: typeof addresses.USDC === 'string' ? addresses.USDC : '',
        USDT: typeof addresses.USDT === 'string' ? addresses.USDT : '',
      }, shared);
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Chain wallet settings update failed', error);
    const message = error instanceof Error ? error.message : '';
    const safeMessage = /address|RPC|confirmations|commitment|mainnet|supported payment network|required wallet/i.test(message) ? message : 'Unable to save chain wallet settings.';
    return Response.json({ error: safeMessage }, { status: 400 });
  }
};
