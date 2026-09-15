import { useState } from 'react'
import { CircleDollarSign, KeyRound, Link2, Unlink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { showToast } from '@/lib/toast'

type Wallet = { address: string; rpcUrl: string; requiredConfirmations: number; enabled: boolean } | null

export function BaseUsdcSettings({ wallet }: { wallet: Wallet }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const connected = wallet?.enabled === true

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const form = new FormData(event.currentTarget)
      const response = await fetch('/api/admin/base-usdc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'connect',
          address: form.get('address'),
          rpcUrl: form.get('rpcUrl'),
          requiredConfirmations: form.get('requiredConfirmations'),
        }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to connect Base USDC.')
      showToast(connected ? 'Base USDC settings updated.' : 'Base USDC connected.', 'success')
      setOpen(false)
      window.location.reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to connect Base USDC.')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/base-usdc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to disconnect Base USDC.')
      showToast('Base USDC disconnected.', 'success')
      window.location.reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to disconnect Base USDC.')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="payment-account-list">
      <div className="payment-account-row">
        <div className="payment-account-details">
          <span className="payment-provider-icon"><CircleDollarSign className="size-6 text-[#58b957]" aria-hidden="true" /></span>
          <div><div className="flex items-center gap-2"><strong>Base USDC</strong><Badge variant={connected ? 'secondary' : 'outline'}>{connected ? 'Connected' : 'Not connected'}</Badge></div><p>Native USDC payments sent directly to your wallet.</p></div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={busy}>
            {wallet ? <KeyRound data-icon="inline-start" /> : <Link2 data-icon="inline-start" />}
            {wallet ? 'Update settings' : 'Connect Base USDC'}
          </Button>
          {connected && <Button type="button" variant="ghost" onClick={() => void disconnect()} disabled={busy}><Unlink data-icon="inline-start" /> Disconnect</Button>}
        </div>
      </div>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{wallet ? 'Update Base USDC settings' : 'Connect Base USDC'}</DialogTitle>
          <DialogDescription>Configure direct Base mainnet USDC settlement. Saving these settings enables Base USDC at checkout.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="base-usdc-address">Receiving wallet</FieldLabel><Input id="base-usdc-address" name="address" defaultValue={wallet?.address ?? ''} placeholder="0x..." autoComplete="off" required /><FieldDescription>Use an EVM wallet you control. Payments are sent directly to this address.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="base-usdc-rpc">Base RPC URL</FieldLabel><Input id="base-usdc-rpc" name="rpcUrl" type="url" defaultValue={wallet?.rpcUrl ?? 'https://mainnet.base.org'} autoComplete="off" required /><FieldDescription>The server uses this private setting to verify Base USDC transfers.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="base-usdc-confirmations">Required confirmations</FieldLabel><Input id="base-usdc-confirmations" name="requiredConfirmations" type="number" min="1" max="100" step="1" defaultValue={wallet?.requiredConfirmations ?? 3} required /><FieldDescription>Payments complete after this many Base blocks.</FieldDescription></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving...' : wallet ? 'Update and enable' : 'Connect Base USDC'}</Button></DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  </>
}
