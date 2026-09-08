import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { showToast } from '@/lib/toast'

type ExchangeRates = {
  CNY: string
  EUR: string
  GBP: string
  JPY: string
}

const exchangeRateFields = [
  { currency: 'CNY', name: 'rateCNY', id: 'rate-cny', placeholder: '7.20' },
  { currency: 'EUR', name: 'rateEUR', id: 'rate-eur', placeholder: '0.92' },
  { currency: 'GBP', name: 'rateGBP', id: 'rate-gbp', placeholder: '0.79' },
  { currency: 'JPY', name: 'rateJPY', id: 'rate-jpy', placeholder: '150' },
] as const

export function CommerceSettingsForm({ currency: initialCurrency, taxRate, exchangeRates }: { currency: string; taxRate: string; exchangeRates: ExchangeRates }) {
  const [currency, setCurrency] = useState(initialCurrency)
  const [saving, setSaving] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const data = new FormData(event.currentTarget)
    const confirmCurrencyChange = currency === initialCurrency || window.confirm('Changing currency will convert editable prices and support settings. Historical transactions will not change. Continue?')

    if (!confirmCurrencyChange) {
      setSaving(false)
      return
    }

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currency,
          taxRate: String(data.get('taxRate') || '0'),
          exchangeRates: {
            CNY: data.get('rateCNY'),
            EUR: data.get('rateEUR'),
            GBP: data.get('rateGBP'),
            JPY: data.get('rateJPY'),
          },
          confirmCurrencyChange,
        }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        showToast(result.error || 'Unable to save commerce settings.')
        return
      }
      showToast('Commerce settings saved.', 'success')
    } catch {
      showToast('Unable to reach the settings service. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return <form onSubmit={save}>
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="commerce-currency">Currency</FieldLabel>
        <NativeSelect id="commerce-currency" className="w-full [&_select]:h-[45px]" value={currency} onChange={(event) => setCurrency(event.target.value)}>
          <NativeSelectOption value="USD">USD</NativeSelectOption><NativeSelectOption value="CNY">CNY</NativeSelectOption><NativeSelectOption value="EUR">EUR</NativeSelectOption><NativeSelectOption value="GBP">GBP</NativeSelectOption><NativeSelectOption value="JPY">JPY</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="commerce-tax-rate">Tax rate (%)</FieldLabel>
        <Input id="commerce-tax-rate" name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue={taxRate} />
        <FieldDescription>A single manual tax rate applies to new orders. Confirm your local tax obligations.</FieldDescription>
      </Field>
      {exchangeRateFields.map((field) => <Field key={field.currency}><FieldLabel htmlFor={field.id}>USD to {field.currency}</FieldLabel><Input id={field.id} name={field.name} defaultValue={exchangeRates[field.currency]} placeholder={field.placeholder} /></Field>)}
      <Button className="w-full sm:w-auto" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save commerce settings'}</Button>
    </FieldGroup>
  </form>
}
