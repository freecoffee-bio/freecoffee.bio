import { useState } from 'react'
import { CircleDollarSign, KeyRound, Link2, Unlink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { showToast } from '@/lib/toast'

type Provider = 'base-usdc' | 'solana-usdc' | 'solana-usdt'
type Wallet = { address: string; rpcUrl: string; requiredConfirmations: number; enabled: boolean } | null
const definitions: Record<Provider, { name: string; description: string; addressPlaceholder: string; rpcUrl: string; confirmationLabel: string; confirmationHelp: string; defaultConfirmations: number }> = {
  'base-usdc': { name: 'Base USDC', description: 'Official USDC on Base mainnet.', addressPlaceholder: '0x...', rpcUrl: 'https://mainnet.base.org', confirmationLabel: 'Required confirmations', confirmationHelp: 'Payments complete after this many Base blocks.', defaultConfirmations: 3 },
  'solana-usdc': { name: 'Solana USDC', description: 'Official Circle USDC on Solana mainnet.', addressPlaceholder: 'Solana wallet address', rpcUrl: 'https://api.mainnet-beta.solana.com', confirmationLabel: 'Commitment level', confirmationHelp: 'Use 1 for confirmed or 2 for finalized.', defaultConfirmations: 2 },
  'solana-usdt': { name: 'Solana USDT', description: 'Official Tether USDT on Solana mainnet.', addressPlaceholder: 'Solana wallet address', rpcUrl: 'https://api.mainnet-beta.solana.com', confirmationLabel: 'Commitment level', confirmationHelp: 'Use 1 for confirmed or 2 for finalized.', defaultConfirmations: 2 },
}

function ChainWalletRow({ provider, wallet }: { provider: Provider; wallet: Wallet }) {
  const definition = definitions[provider]
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const connected = wallet?.enabled === true

  async function request(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/chain-wallets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, ...body }) })
    const result = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) throw new Error(result.error || `Unable to update ${definition.name}.`)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const form = new FormData(event.currentTarget)
      await request({ action: 'connect', address: form.get('address'), rpcUrl: form.get('rpcUrl'), requiredConfirmations: form.get('requiredConfirmations') })
      showToast(`${definition.name} ${connected ? 'updated' : 'connected'}.`, 'success')
      setOpen(false)
      window.location.reload()
    } catch (error) { showToast(error instanceof Error ? error.message : `Unable to update ${definition.name}.`) } finally { setBusy(false) }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await request({ action: 'disconnect' })
      showToast(`${definition.name} disconnected.`, 'success')
      window.location.reload()
    } catch (error) { showToast(error instanceof Error ? error.message : `Unable to disconnect ${definition.name}.`) } finally { setBusy(false) }
  }

  return <>
    <div className="payment-account-row">
      <div className="payment-account-details"><span className="payment-provider-icon"><CircleDollarSign className="size-6 text-[#2775CA]" aria-hidden="true" /></span><div><div className="flex items-center gap-2"><strong>{definition.name}</strong><Badge variant={connected ? 'secondary' : 'outline'}>{connected ? 'Connected' : 'Not connected'}</Badge></div><p>{definition.description}</p></div></div>
      <div className="flex items-center gap-2"><Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={busy}>{wallet ? <KeyRound data-icon="inline-start" /> : <Link2 data-icon="inline-start" />}{wallet ? 'Update settings' : `Connect ${definition.name}`}</Button>{connected && <Button type="button" variant="ghost" onClick={() => void disconnect()} disabled={busy}><Unlink data-icon="inline-start" /> Disconnect</Button>}</div>
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{wallet ? 'Update' : 'Connect'} {definition.name}</DialogTitle><DialogDescription>Saving these settings enables {definition.name} at checkout. The RPC URL remains server-side.</DialogDescription></DialogHeader><form onSubmit={(event) => void submit(event)}><FieldGroup>
      <Field><FieldLabel htmlFor={`${provider}-address`}>Receiving wallet</FieldLabel><Input id={`${provider}-address`} name="address" defaultValue={wallet?.address ?? ''} placeholder={definition.addressPlaceholder} autoComplete="off" required /><FieldDescription>Payments are sent directly to an address you control.</FieldDescription></Field>
      <Field><FieldLabel htmlFor={`${provider}-rpc`}>RPC URL</FieldLabel><Input id={`${provider}-rpc`} name="rpcUrl" type="url" defaultValue={wallet?.rpcUrl ?? definition.rpcUrl} autoComplete="off" required /><FieldDescription>Use a reliable HTTPS mainnet endpoint. Provider keys in the URL are stored privately.</FieldDescription></Field>
      <Field><FieldLabel htmlFor={`${provider}-confirmations`}>{definition.confirmationLabel}</FieldLabel><Input id={`${provider}-confirmations`} name="requiredConfirmations" type="number" min="1" max={provider === 'base-usdc' ? 100 : 2} step="1" defaultValue={wallet?.requiredConfirmations ?? definition.defaultConfirmations} required /><FieldDescription>{definition.confirmationHelp}</FieldDescription></Field>
      <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save and enable'}</Button></DialogFooter>
    </FieldGroup></form></DialogContent></Dialog>
  </>
}

export function ChainWalletSettings({ wallets }: { wallets: Array<{ network: string; asset: string; address: string; rpcUrl: string; requiredConfirmations: number; enabled: boolean }> }) {
  const wallet = (network: string, asset: string) => wallets.find((item) => item.network === network && item.asset === asset) ?? null
  return <div className="payment-account-list"><ChainWalletRow provider="base-usdc" wallet={wallet('base', 'USDC')} /><ChainWalletRow provider="solana-usdc" wallet={wallet('solana', 'USDC')} /><ChainWalletRow provider="solana-usdt" wallet={wallet('solana', 'USDT')} /></div>
}
