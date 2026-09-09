import { useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { KeyRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { showToast } from '@/lib/toast'

type TwoFactorSetup = { totpURI: string; backupCodes: string[]; image: string }

export function TwoFactorSettings({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [password, setPassword] = useState('')
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null)
  const [busy, setBusy] = useState(false)

  async function beginSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await fetch('/api/auth/two-factor/enable', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password, method: 'totp', issuer: 'FreeCoffee.bio' }) })
      const result = await response.json().catch(() => ({})) as { message?: string; totpURI?: string; backupCodes?: string[] }
      if (!response.ok || !result.totpURI || !result.backupCodes) throw new Error(result.message || 'Unable to start two-factor setup.')
      setSetup({ totpURI: result.totpURI, backupCodes: result.backupCodes, image: await QRCode.toDataURL(result.totpURI, { margin: 1, width: 200 }) })
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to start two-factor setup.') } finally { setBusy(false) }
  }

  async function confirmSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = String(new FormData(event.currentTarget).get('code') || '')
    setBusy(true)
    try {
      const response = await fetch('/api/auth/two-factor/verify-totp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })
      const result = await response.json().catch(() => ({})) as { message?: string }
      if (!response.ok) throw new Error(result.message || 'Invalid verification code.')
      setEnabled(true)
      setSetup(null)
      setPassword('')
      showToast('Two-factor authentication is enabled.', 'success')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to verify the code.') } finally { setBusy(false) }
  }

  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await fetch('/api/auth/two-factor/disable', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
      const result = await response.json().catch(() => ({})) as { message?: string }
      if (!response.ok) throw new Error(result.message || 'Unable to disable two-factor authentication.')
      setEnabled(false)
      setPassword('')
      showToast('Two-factor authentication is disabled.', 'success')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to disable two-factor authentication.') } finally { setBusy(false) }
  }

  return <><div className="flex flex-col gap-6"><div><h2 className="text-lg font-semibold">Two-factor authentication</h2><p className="mt-1 text-sm text-muted-foreground">Use an authenticator app to add a verification step when signing in.</p></div>{enabled ? <form onSubmit={disable}><FieldGroup><Field><FieldLabel htmlFor="disable-2fa-password">Current password</FieldLabel><Input id="disable-2fa-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></Field><Button variant="destructive" type="submit" disabled={busy}>{busy ? 'Disabling...' : 'Disable two-factor authentication'}</Button></FieldGroup></form> : <form onSubmit={beginSetup}><FieldGroup><Field><FieldLabel htmlFor="enable-2fa-password">Current password</FieldLabel><Input id="enable-2fa-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><FieldDescription>Scan a QR code with an authenticator app, then verify a six-digit code.</FieldDescription></Field><Button type="submit" disabled={busy}><KeyRound data-icon="inline-start" />{busy ? 'Preparing...' : 'Set up two-factor authentication'}</Button></FieldGroup></form>}</div><Dialog open={Boolean(setup)} onOpenChange={(open) => { if (!open) setSetup(null) }}><DialogContent><DialogHeader><DialogTitle>Set up authenticator app</DialogTitle><DialogDescription>Scan this QR code, save your recovery codes somewhere secure, then enter the code shown by your authenticator app.</DialogDescription></DialogHeader>{setup && <form onSubmit={confirmSetup} className="grid gap-5"><div className="grid justify-items-center gap-3"><img src={setup.image} alt="Authenticator app QR code" className="size-50 rounded-lg border bg-white p-2" /><code className="max-w-full break-all rounded bg-muted px-2 py-1 text-xs">{setup.totpURI}</code></div><div className="rounded-lg border bg-muted/30 p-3"><p className="mb-2 text-sm font-medium">Recovery codes</p><div className="grid grid-cols-2 gap-1 font-mono text-xs">{setup.backupCodes.map((code) => <span key={code}>{code}</span>)}</div></div><Field><FieldLabel htmlFor="two-factor-code">Verification code</FieldLabel><Input id="two-factor-code" name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={8} required /></Field><DialogFooter><Button type="submit" disabled={busy}>{busy ? 'Verifying...' : 'Verify and enable'}</Button></DialogFooter></form>}</DialogContent></Dialog></>
}
