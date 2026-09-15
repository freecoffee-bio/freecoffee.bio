import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { showToast } from '@/lib/toast'

type SupportSettings = {
  suggestedSupportAmounts: string | null
  minimumSupportAmount: number | null
  supportWording: string | null
  supportThankYouMessage: string | null
}

function parseAmounts(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? '')
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((amount) => Number.isSafeInteger(amount) && amount > 0)) return parsed as number[]
  } catch {}
  return [300, 500, 1000]
}

export function SupportSettingsForm({ displayName, currency, page, adminPath }: { displayName: string; currency: string; page: SupportSettings | null; adminPath: string }) {
  const [saving, setSaving] = useState(false)
  const divisor = currency === 'JPY' ? 1 : 100
  const symbol = currency === 'USD' ? '$' : currency
  const amounts = parseAmounts(page?.suggestedSupportAmounts)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const data = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/admin/creator', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName,
          suggestedSupportAmounts: ['supportAmount1', 'supportAmount2', 'supportAmount3'].map((name) => String(data.get(name) || '')),
          minimumSupportAmount: String(data.get('minimumSupportAmount') || ''),
          supportWording: data.get('supportWording'),
          supportThankYouMessage: data.get('supportThankYouMessage'),
        }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save support settings.')
      showToast('Support settings saved.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save support settings.')
    } finally {
      setSaving(false)
    }
  }

  return <form onSubmit={save}>
    <FieldGroup>
      <Field>
        <FieldLabel>Choose 3 amounts</FieldLabel>
        <div className="grid gap-3">
          {amounts.map((amount, index) => <div className="relative" key={index}><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">{symbol}</span><Input name={`supportAmount${index + 1}`} type="number" min="0.01" step={currency === 'JPY' ? 1 : 0.01} defaultValue={amount / divisor} className="pl-10!" required /></div>)}
        </div>
        <FieldDescription>These amounts appear as quick choices on the public support form.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="minimum-support-amount">Minimum amount</FieldLabel>
        <div className="relative"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">{symbol}</span><Input id="minimum-support-amount" name="minimumSupportAmount" type="number" min="0.01" step={currency === 'JPY' ? 1 : 0.01} defaultValue={(page?.minimumSupportAmount ?? divisor) / divisor} className="pl-10!" required /></div>
      </Field>
      <Field>
        <FieldLabel htmlFor="support-wording">Tip or Donate wording</FieldLabel>
        <NativeSelect id="support-wording" name="supportWording" className="w-full [&_select]:h-11.25" defaultValue={page?.supportWording === 'tip' ? 'tip' : 'donate'}>
          <NativeSelectOption value="donate">Donate</NativeSelectOption><NativeSelectOption value="tip">Tip</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="support-thank-you-message">Auto thank-you message</FieldLabel>
        <FieldDescription>Shown on the payment success page. To edit the thank-you email, go to <a href={`/${adminPath}/notifications`} className="font-medium text-primary underline-offset-4 hover:underline">Notifications</a>.</FieldDescription>
        <Textarea id="support-thank-you-message" name="supportThankYouMessage" rows={5} maxLength={1000} defaultValue={page?.supportThankYouMessage ?? ''} placeholder="Thank you so much for your support!" />
      </Field>
      <Button className="w-full sm:w-auto" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save support settings'}</Button>
    </FieldGroup>
  </form>
}
