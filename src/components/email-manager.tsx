import { useState, type FormEvent } from 'react'
import { Mail, Send, Server, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { showToast } from '@/lib/toast'

type SmtpSettings = { host: string; port: number; username: string; secure: boolean; fromAddress: string; replyTo: string | null; enabled: boolean }
type Provider = 'resend' | 'brevo'
type ProviderStatus = { apiKeyConfigured: boolean; fromAddress: string; fromName: string; replyTo: string }
type DeliverySettings = { activeProvider: 'smtp' | Provider | null; providers: Partial<Record<Provider, ProviderStatus>> }

const providerNames = { smtp: 'SMTP', resend: 'Resend API', brevo: 'Brevo API' } as const

export function EmailManager({ initialSettings, initialDelivery }: { initialSettings: SmtpSettings | null; initialDelivery: DeliverySettings }) {
  const [settings, setSettings] = useState(initialSettings)
  const [delivery, setDelivery] = useState(initialDelivery)
  const [savingSmtp, setSavingSmtp] = useState(false)
  const [savingApi, setSavingApi] = useState(false)
  const [testing, setTesting] = useState(false)
  const [password, setPassword] = useState('')
  const [secure, setSecure] = useState(initialSettings?.secure ?? true)
  const [activateSmtp, setActivateSmtp] = useState(initialDelivery.activeProvider === 'smtp')
  const [provider, setProvider] = useState<Provider>('resend')
  const [activateApi, setActivateApi] = useState(initialDelivery.activeProvider === 'resend')
  const apiStatus = delivery.providers[provider]

  async function saveSmtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingSmtp(true)
    const data = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/admin/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ host: data.get('host'), port: data.get('port'), username: data.get('username'), password, fromAddress: data.get('fromAddress'), replyTo: data.get('replyTo'), secure, enabled: activateSmtp }) })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save SMTP settings.')
      setSettings({ host: String(data.get('host')), port: Number(data.get('port')), username: String(data.get('username') || ''), secure, fromAddress: String(data.get('fromAddress')), replyTo: String(data.get('replyTo') || '') || null, enabled: activateSmtp })
      if (activateSmtp) setDelivery((current) => ({ ...current, activeProvider: 'smtp' }))
      setPassword('')
      showToast(activateSmtp ? 'SMTP saved and activated.' : 'SMTP settings saved.', 'success')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to save SMTP settings.') } finally { setSavingSmtp(false) }
  }

  async function saveApi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setSavingApi(true)
    const data = new FormData(form)
    try {
      const response = await fetch('/api/admin/email-api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, apiKey: data.get('apiKey'), fromAddress: data.get('fromAddress'), fromName: data.get('fromName'), replyTo: data.get('replyTo'), activate: activateApi }) })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save email API settings.')
      setDelivery((current) => ({ ...current, activeProvider: activateApi ? provider : current.activeProvider, providers: { ...current.providers, [provider]: { apiKeyConfigured: true, fromAddress: String(data.get('fromAddress')), fromName: String(data.get('fromName') || ''), replyTo: String(data.get('replyTo') || '') } } }))
      showToast(activateApi ? `${providerNames[provider]} saved and activated.` : `${providerNames[provider]} settings saved.`, 'success')
      form.reset()
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to save email API settings.') } finally { setSavingApi(false) }
  }

  async function test(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTesting(true)
    const to = new FormData(event.currentTarget).get('to')
    try {
      const response = await fetch('/api/admin/email-test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to }) })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to send test email.')
      showToast('Test email sent.', 'success')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to send test email.') } finally { setTesting(false) }
  }

  return <div className="media-manager"><Tabs defaultValue="delivery" className="w-full gap-0"><TabsList className="settings-tabs h-auto! w-full justify-start"><TabsTrigger value="delivery" className="settings-tab h-auto flex-none px-4.5 py-2.5">Email</TabsTrigger><TabsTrigger value="smtp" className="settings-tab h-auto flex-none px-4.5 py-2.5">SMTP</TabsTrigger><TabsTrigger value="api" className="settings-tab h-auto flex-none px-4.5 py-2.5">API</TabsTrigger></TabsList>
    <TabsContent value="delivery"><section className="settings-card mt-0"><div className="connected-heading"><h2>Email delivery</h2><p>Choose one active service for receipts and creator notifications.</p></div><div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-background text-primary"><Mail aria-hidden="true" /></span><div><p className="m-0 text-sm font-semibold">{delivery.activeProvider ? providerNames[delivery.activeProvider] : 'No delivery service selected'}</p><p className="m-0 mt-1 text-sm text-muted-foreground">{delivery.activeProvider ? 'All email notifications use this service.' : 'Configure SMTP or an email API, then make it active.'}</p></div></div><form className="mt-6" onSubmit={test}><FieldGroup><Field><FieldLabel htmlFor="email-test-recipient">Test recipient</FieldLabel><Input id="email-test-recipient" name="to" type="email" placeholder="you@example.com" required disabled={!delivery.activeProvider} /><FieldDescription>A test email is sent immediately using the active service and recorded in delivery logs.</FieldDescription></Field><Button className="w-full sm:w-auto" type="submit" disabled={testing || !delivery.activeProvider}><Send data-icon="inline-start" />{testing ? 'Sending...' : 'Send test email'}</Button></FieldGroup></form></section></TabsContent>
    <TabsContent value="smtp"><section className="settings-card mt-0"><div className="connected-heading"><h2>SMTP configuration</h2><p>Use an SMTP server for email delivery.</p></div><form className="mt-6" onSubmit={saveSmtp}><FieldGroup><Field><FieldLabel htmlFor="smtp-host">SMTP host</FieldLabel><Input id="smtp-host" name="host" defaultValue={settings?.host ?? ''} placeholder="smtp.example.com" required /></Field><Field><FieldLabel htmlFor="smtp-port">Port</FieldLabel><Input id="smtp-port" name="port" type="number" min="1" max="65535" defaultValue={settings?.port ?? 587} required /></Field><Field><FieldLabel htmlFor="smtp-username">Username</FieldLabel><Input id="smtp-username" name="username" defaultValue={settings?.username ?? ''} /></Field><Field><FieldLabel htmlFor="smtp-password">Password</FieldLabel><Input id="smtp-password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={settings ? 'Saved - leave blank to keep it' : 'Required'} autoComplete="new-password" /><FieldDescription>{settings ? 'A password is already saved. Leave this blank to keep it.' : 'Enter the password for your SMTP account.'}</FieldDescription></Field><Field><FieldLabel htmlFor="smtp-from-address">From address</FieldLabel><Input id="smtp-from-address" name="fromAddress" type="email" defaultValue={settings?.fromAddress ?? ''} placeholder="receipts@example.com" required /></Field><Field><FieldLabel htmlFor="smtp-reply-to">Reply-to address</FieldLabel><Input id="smtp-reply-to" name="replyTo" type="email" defaultValue={settings?.replyTo ?? ''} placeholder="support@example.com" /></Field><Field orientation="horizontal" className="items-center gap-3 rounded-lg border bg-muted/30 px-3 py-3"><Checkbox id="smtp-secure" checked={secure} onCheckedChange={(checked) => setSecure(checked === true)} /><FieldLabel htmlFor="smtp-secure" className="font-medium">Use TLS</FieldLabel></Field><Field orientation="horizontal" className="items-center gap-3 rounded-lg border bg-muted/30 px-3 py-3"><Checkbox id="smtp-active" checked={activateSmtp} onCheckedChange={(checked) => setActivateSmtp(checked === true)} /><FieldLabel htmlFor="smtp-active" className="font-medium">Use SMTP as the active delivery service</FieldLabel></Field><Button className="w-full sm:w-auto" type="submit" disabled={savingSmtp}><Server data-icon="inline-start" />{savingSmtp ? 'Saving...' : activateSmtp ? 'Save and activate SMTP' : 'Save SMTP settings'}</Button></FieldGroup></form></section></TabsContent>
    <TabsContent value="api"><section className="settings-card mt-0"><div className="connected-heading"><h2>Email API provider</h2><p>Configure a supported HTTP email provider. Credentials are stored securely and never displayed after saving.</p></div><form className="mt-6" onSubmit={saveApi}><FieldGroup><Field><FieldLabel htmlFor="email-api-provider">Email service</FieldLabel><NativeSelect id="email-api-provider" className="w-full" value={provider} onChange={(event) => { const next = event.target.value as Provider; setProvider(next); setActivateApi(delivery.activeProvider === next) }}><NativeSelectOption value="resend">Resend</NativeSelectOption><NativeSelectOption value="brevo">Brevo</NativeSelectOption></NativeSelect></Field><Field><FieldLabel htmlFor="email-api-key">API key</FieldLabel><Input id="email-api-key" name="apiKey" type="password" placeholder={apiStatus?.apiKeyConfigured ? 'Saved - leave blank to keep it' : provider === 'resend' ? 're_...' : 'xkeysib-...'} autoComplete="new-password" required={!apiStatus?.apiKeyConfigured} /><FieldDescription>{apiStatus?.apiKeyConfigured ? 'An API key is already saved. Leave this blank to keep it.' : 'Use an API key created in the selected provider dashboard.'}</FieldDescription></Field><Field><FieldLabel htmlFor="email-api-from-address">From address</FieldLabel><Input id="email-api-from-address" name="fromAddress" type="email" defaultValue={apiStatus?.fromAddress ?? ''} key={`${provider}-from`} placeholder="receipts@example.com" required /></Field><Field><FieldLabel htmlFor="email-api-from-name">Sender name</FieldLabel><Input id="email-api-from-name" name="fromName" defaultValue={apiStatus?.fromName ?? ''} key={`${provider}-name`} placeholder="FreeCoffee.bio" /></Field><Field><FieldLabel htmlFor="email-api-reply-to">Reply-to address</FieldLabel><Input id="email-api-reply-to" name="replyTo" type="email" defaultValue={apiStatus?.replyTo ?? ''} key={`${provider}-reply`} placeholder="support@example.com" /></Field><Field orientation="horizontal" className="items-center gap-3 rounded-lg border bg-muted/30 px-3 py-3"><Checkbox id="email-api-active" checked={activateApi} onCheckedChange={(checked) => setActivateApi(checked === true)} /><FieldLabel htmlFor="email-api-active" className="font-medium">Use {providerNames[provider]} as the active delivery service</FieldLabel></Field><Button className="w-full sm:w-auto" type="submit" disabled={savingApi}><ShieldCheck data-icon="inline-start" />{savingApi ? 'Saving...' : activateApi ? `Save and activate ${providerNames[provider]}` : `Save ${providerNames[provider]}`}</Button></FieldGroup></form></section></TabsContent>
  </Tabs></div>
}
