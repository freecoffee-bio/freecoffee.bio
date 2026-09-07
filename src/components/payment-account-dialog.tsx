import { useState } from 'react'
import { KeyRound, Link2, Unlink } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { showToast } from '@/lib/toast'

type Provider = 'stripe' | 'paypal'

type Props = {
  provider: Provider
  connected: boolean
  paypalSandbox?: boolean
}

const providerDetails = {
  stripe: {
    name: 'Stripe',
    description: 'Add the Stripe API credentials used to create checkouts and verify webhooks.',
    fields: [
      { name: 'stripeSecretKey', label: 'Secret key', placeholder: 'sk_test_...', description: 'Use a restricted or test key while setting up your shop.' },
      { name: 'stripeWebhookSecret', label: 'Webhook signing secret', placeholder: 'whsec_...', description: 'Required to confirm successful payments securely.' },
    ],
  },
  paypal: {
    name: 'PayPal',
    description: 'Add the PayPal sandbox credentials used to create checkouts and verify webhooks.',
    fields: [
      { name: 'paypalClientId', label: 'Client ID', placeholder: 'PayPal client ID', description: 'Use your PayPal sandbox application credentials.' },
      { name: 'paypalClientSecret', label: 'Client secret', placeholder: 'PayPal client secret', description: 'This value is stored securely and never shown again.' },
      { name: 'paypalWebhookId', label: 'Webhook ID', placeholder: 'PayPal webhook ID', description: 'Required to verify PayPal webhook events.' },
    ],
  },
} as const

export function PaymentAccountDialog({ provider, connected, paypalSandbox = false }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
    const [sandbox, setSandbox] = useState(paypalSandbox)
  const details = providerDetails[provider]

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const data = new FormData(event.currentTarget)
      const values = details.fields.map((field) => String(data.get(field.name) || '').trim())
      if (values.some((value) => !value)) {
        showToast(`Enter all ${details.name} credentials.`)
        return
      }
      const settingsResponse = await fetch('/api/admin/payment-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, credentials: provider === 'paypal' ? { clientId: values[0], clientSecret: values[1], webhookId: values[2] } : { secretKey: values[0], webhookSecret: values[1] }, options: provider === 'paypal' ? { sandbox } : {} }),
      })
      const settingsResult = await settingsResponse.json().catch(() => ({})) as { error?: string }
      if (!settingsResponse.ok) throw new Error(settingsResult.error || `Unable to save ${details.name} credentials.`)

      const accountResponse = await fetch('/api/admin/payment-accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, status: 'connected' }),
      })
      const accountResult = await accountResponse.json().catch(() => ({})) as { error?: string }
      if (!accountResponse.ok) throw new Error(accountResult.error || `Unable to connect ${details.name}.`)
      showToast(`${details.name} connected.`, 'success')
      setOpen(false)
      window.location.reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Unable to connect ${details.name}.`)
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/payment-accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, status: 'not_connected' }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || `Unable to disconnect ${details.name}.`)
      showToast(`${details.name} disconnected.`, 'success')
      window.location.reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Unable to disconnect ${details.name}.`)
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={busy}>
        {connected ? <KeyRound data-icon="inline-start" /> : <Link2 data-icon="inline-start" />}
        {connected ? 'Update credentials' : `Connect ${details.name}`}
      </Button>
      {connected && <Button type="button" variant="ghost" onClick={() => void disconnect()} disabled={busy} aria-label={`Disconnect ${details.name}`}><Unlink data-icon="inline-start" /> Disconnect</Button>}
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{connected ? `Update ${details.name} credentials` : `Connect ${details.name}`}</DialogTitle>
          <DialogDescription>{details.description} Existing saved credentials are not displayed; enter all fields to replace them.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          {provider === 'paypal' && <Field orientation="horizontal" className="items-center justify-between rounded-lg border px-3 py-3"><div><FieldLabel htmlFor="paypal-sandbox">Sandbox</FieldLabel><FieldDescription>Use PayPal test accounts and the sandbox API.</FieldDescription></div><Switch id="paypal-sandbox" checked={sandbox} onCheckedChange={setSandbox} /></Field>}
          {details.fields.map((field) => <Field key={field.name}><FieldLabel htmlFor={`${provider}-${field.name}`}>{field.label}</FieldLabel><Input id={`${provider}-${field.name}`} name={field.name} type="password" placeholder={field.placeholder} autoComplete="new-password" required /><FieldDescription>{field.description}</FieldDescription></Field>)}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving...' : connected ? 'Update and verify' : `Connect ${details.name}`}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>
}
