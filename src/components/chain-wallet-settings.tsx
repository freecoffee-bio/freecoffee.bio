import { useState } from 'react'
import { KeyRound, Link2, Unlink } from 'lucide-react'
import { SiSolana } from '@icons-pack/react-simple-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { showToast } from '@/lib/toast'

type Network = 'base' | 'solana'
type Wallet = { address: string; rpcUrl: string; requiredConfirmations: number; enabled: boolean } | null

type ChainDefinition = {
  name: string
  description: string
  rpcUrl: string
  confirmationLabel: string
  confirmationHelp: string
  defaultConfirmations: number
  maxConfirmations: number
  assets: Array<{ name: 'USDC' | 'USDT'; description: string; placeholder: string }>
}

const definitions: Record<Network, ChainDefinition> = {
  base: {
    name: 'Base',
    description: 'Base mainnet · Supports USDC.',
    rpcUrl: 'https://mainnet.base.org',
    confirmationLabel: 'Required confirmations',
    confirmationHelp: 'Payments complete after this many Base blocks.',
    defaultConfirmations: 3,
    maxConfirmations: 100,
    assets: [{ name: 'USDC', description: 'Official USDC on Base mainnet.', placeholder: '0x...' }],
  },
  solana: {
    name: 'Solana',
    description: 'Solana mainnet · Supports USDC and USDT.',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    confirmationLabel: 'Commitment level',
    confirmationHelp: 'Use 1 for confirmed or 2 for finalized.',
    defaultConfirmations: 2,
    maxConfirmations: 2,
    assets: [
      { name: 'USDC', description: 'Official Circle USDC on Solana mainnet.', placeholder: 'USDC receiving wallet' },
      { name: 'USDT', description: 'Official Tether USDT on Solana mainnet.', placeholder: 'USDT receiving wallet' },
    ],
  },
}

function BaseIcon() {
  return <svg viewBox="0 0 32 32" className="size-6" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#0052ff" /><path fill="white" d="M8 15h16v3H8z" /></svg>
}

function ChainCard({ network, wallets }: { network: Network; wallets: Partial<Record<'USDC' | 'USDT', Wallet>> }) {
  const definition = definitions[network]
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const configuredWallets = definition.assets.map(({ name }) => wallets[name]).filter((wallet): wallet is NonNullable<Wallet> => wallet !== null && wallet !== undefined)
  const connected = configuredWallets.length === definition.assets.length && configuredWallets.every((wallet) => wallet.enabled)
  const hasSettings = configuredWallets.length > 0
  const sharedSettings = configuredWallets[0]

  async function request(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/chain-wallets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ network, ...body }),
    })
    const result = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) throw new Error(result.error || `Unable to update ${definition.name}.`)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const form = new FormData(event.currentTarget)
      const addresses = Object.fromEntries(definition.assets.map(({ name }) => [name, form.get(`address${name}`)]))
      await request({ action: 'connect', addresses, rpcUrl: form.get('rpcUrl'), requiredConfirmations: form.get('requiredConfirmations') })
      showToast(`${definition.name} wallet settings saved.`, 'success')
      setOpen(false)
      window.location.reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Unable to update ${definition.name}.`)
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await request({ action: 'disconnect' })
      showToast(`${definition.name} wallets disconnected.`, 'success')
      window.location.reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Unable to disconnect ${definition.name}.`)
    } finally {
      setBusy(false)
    }
  }

  return <>
    <section className="chain-card">
      <div className="chain-card-header">
        <span className="payment-provider-icon">{network === 'base' ? <BaseIcon /> : <SiSolana className="size-6" aria-hidden="true" />}</span>
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><strong>{definition.name}</strong><Badge variant={connected ? 'secondary' : 'outline'}>{connected ? 'Connected' : 'Not connected'}</Badge></div><p>{definition.description}</p></div>
        <div className="chain-wallet-actions"><Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={busy}>{hasSettings ? <KeyRound data-icon="inline-start" /> : <Link2 data-icon="inline-start" />}{hasSettings ? 'Update settings' : `Connect ${definition.name}`}</Button>{connected && <Button type="button" variant="ghost" onClick={() => void disconnect()} disabled={busy}><Unlink data-icon="inline-start" /> Disconnect</Button>}</div>
      </div>
    </section>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{hasSettings ? 'Update' : 'Connect'} {definition.name}</DialogTitle><DialogDescription>Configure all supported stablecoin wallets for {definition.name}. RPC and confirmation settings are shared by the chain.</DialogDescription></DialogHeader>
        <form onSubmit={(event) => void submit(event)}><FieldGroup>
          {definition.assets.map((asset) => <Field key={asset.name}><FieldLabel htmlFor={`${network}-${asset.name.toLowerCase()}-address`}>{asset.name} receiving wallet</FieldLabel><Input id={`${network}-${asset.name.toLowerCase()}-address`} name={`address${asset.name}`} defaultValue={wallets[asset.name]?.address ?? ''} placeholder={asset.placeholder} autoComplete="off" required /><FieldDescription>{asset.description} Payments are sent directly to this address.</FieldDescription></Field>)}
          <Field><FieldLabel htmlFor={`${network}-rpc`}>{definition.name} RPC URL</FieldLabel><Input id={`${network}-rpc`} name="rpcUrl" type="url" defaultValue={sharedSettings?.rpcUrl ?? definition.rpcUrl} autoComplete="off" required /><FieldDescription>This endpoint is shared by all {definition.name} stablecoins and remains server-side.</FieldDescription></Field>
          <Field><FieldLabel htmlFor={`${network}-confirmations`}>{definition.confirmationLabel}</FieldLabel><Input id={`${network}-confirmations`} name="requiredConfirmations" type="number" min="1" max={definition.maxConfirmations} step="1" defaultValue={sharedSettings?.requiredConfirmations ?? definition.defaultConfirmations} required /><FieldDescription>{definition.confirmationHelp} This setting applies to every {definition.name} stablecoin.</FieldDescription></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save and enable'}</Button></DialogFooter>
        </FieldGroup></form>
      </DialogContent>
    </Dialog>
  </>
}

export function ChainWalletSettings({ wallets }: { wallets: Array<{ network: string; asset: string; address: string; rpcUrl: string; requiredConfirmations: number; enabled: boolean }> }) {
  const wallet = (network: string, asset: string) => wallets.find((item) => item.network === network && item.asset === asset) ?? null
  return <div className="chain-card-list">
    <ChainCard network="base" wallets={{ USDC: wallet('base', 'USDC') }} />
    <ChainCard network="solana" wallets={{ USDC: wallet('solana', 'USDC'), USDT: wallet('solana', 'USDT') }} />
  </div>
}
