import { useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { showToast } from '@/lib/toast'

type Props = {
  initial: {
    turnstile: { enabled: boolean; siteKey: string; siteKeyConfigured: boolean; secretKeyConfigured: boolean }
  }
}

export function SecuritySettings({ initial }: Props) {
  const [turnstileEnabled, setTurnstileEnabled] = useState(initial.turnstile.enabled)
  const [siteKey, setSiteKey] = useState(initial.turnstile.siteKey)
  const [secretKey, setSecretKey] = useState('')
  const [secretConfigured, setSecretConfigured] = useState(initial.turnstile.secretKeyConfigured)
  const [saving, setSaving] = useState(false)

  async function saveTurnstile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await fetch('/api/admin/security', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ turnstileEnabled, turnstileSiteKey: siteKey, turnstileSecretKey: secretKey }) })
      const result = await response.json().catch(() => ({})) as { error?: string; turnstile?: Props['initial']['turnstile'] }
      if (!response.ok || !result.turnstile) throw new Error(result.error || 'Unable to save Turnstile settings.')
      setTurnstileEnabled(result.turnstile.enabled)
      setSiteKey(result.turnstile.siteKey)
      setSecretConfigured(result.turnstile.secretKeyConfigured)
      setSecretKey('')
      showToast(result.turnstile.enabled ? 'Turnstile saved and enabled.' : 'Turnstile settings saved.', 'success')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to save Turnstile settings.') } finally { setSaving(false) }
  }

  return <section><div className="connected-heading"><h2>Turnstile</h2><p>Require every user to pass a Turnstile challenge before signing in or registering.</p></div><form className="mt-6" onSubmit={saveTurnstile}><FieldGroup><Field><FieldLabel htmlFor="turnstile-site-key">Site key</FieldLabel><Input id="turnstile-site-key" value={siteKey} onChange={(event) => setSiteKey(event.target.value)} placeholder="0x4AAAA..." autoComplete="off" /><FieldDescription>Used by login and registration pages to render the challenge.</FieldDescription></Field><Field><FieldLabel htmlFor="turnstile-secret-key">Secret key</FieldLabel><Input id="turnstile-secret-key" type="password" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} placeholder={secretConfigured ? 'Saved - leave blank to keep it' : 'Enter your Turnstile secret key'} autoComplete="new-password" /><FieldDescription>{secretConfigured ? 'A secret key is stored securely. Enter a new value only to replace it.' : 'Used only by the server to verify challenge responses.'}</FieldDescription></Field><Field orientation="horizontal" className="items-center gap-3 rounded-lg border bg-muted/30 px-3 py-3"><Checkbox id="turnstile-enabled" checked={turnstileEnabled} onCheckedChange={(checked) => setTurnstileEnabled(checked === true)} /><FieldLabel htmlFor="turnstile-enabled" className="font-medium">Require Turnstile for all sign-ins and registrations</FieldLabel></Field><Button className="w-full sm:w-auto" type="submit" disabled={saving}><ShieldCheck data-icon="inline-start" />{saving ? 'Saving...' : 'Save Turnstile settings'}</Button></FieldGroup></form></section>
}
