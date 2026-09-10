import { useState, type FormEvent } from 'react'

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator, FieldSet, FieldLegend } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { showToast } from '@/lib/toast'

type PageSettings = {
  themeColor: string | null
  welcomeMessage: string | null
  defaultSupportAmount: number | null
  allowAnonymous: boolean | null
  showSupport: boolean | null
  showShop: boolean | null
  supportGoalEnabled: boolean | null
  supportGoalTitle: string | null
  supportGoalAmount: number | null
  supportGoalDescription: string | null
  terms: string | null
  analyticsCode: string | null
}

type AnalyticsMode = 'google' | 'custom'

function googleAnalyticsCode(id: string) {
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', '${id}');
</script>`
}

function measurementIdFromCode(code: string | null | undefined) {
  const match = code?.match(/googletagmanager\.com\/gtag\/js\?id=(G-[A-Z0-9-]+)/i)
  return match?.[1] ?? ''
}

type Toggles = {
  allowAnonymous: boolean
  showSupport: boolean
  showShop: boolean
  supportGoalEnabled: boolean
}

export function PageSettingsForm({ displayName, currency, page }: { displayName: string; currency: string; page: PageSettings | null }) {
  const [toggles, setToggles] = useState<Toggles>({
    allowAnonymous: page?.allowAnonymous ?? true,
    showSupport: page?.showSupport ?? true,
    showShop: page?.showShop ?? true,
    supportGoalEnabled: page?.supportGoalEnabled ?? false,
  })
  const [saving, setSaving] = useState(false)
  const initialMeasurementId = measurementIdFromCode(page?.analyticsCode)
  const [analyticsMode, setAnalyticsMode] = useState<AnalyticsMode>(initialMeasurementId || !page?.analyticsCode ? 'google' : 'custom')
  const [measurementId, setMeasurementId] = useState(initialMeasurementId)
  const [analyticsCode, setAnalyticsCode] = useState(page?.analyticsCode ?? '')
  const divisor = currency === 'JPY' ? 1 : 100

  function setToggle(name: keyof Toggles, checked: boolean) {
    setToggles((current) => ({ ...current, [name]: checked }))
  }

  function changeAnalyticsMode(mode: AnalyticsMode) {
    setAnalyticsMode(mode)
    if (mode === 'custom' && !analyticsCode.trim()) setAnalyticsCode(googleAnalyticsCode(measurementId || 'G-XXXXXXXXXX'))
  }

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
          themeColor: data.get('themeColor'),
          welcomeMessage: data.get('welcomeMessage'),

          defaultSupportAmount: String(data.get('defaultSupportAmount')),
          allowAnonymous: toggles.allowAnonymous,
          showSupport: toggles.showSupport,
          showShop: toggles.showShop,
          supportGoalEnabled: toggles.supportGoalEnabled,
          supportGoalTitle: data.get('supportGoalTitle'),
          supportGoalAmount: String(data.get('supportGoalAmount')),
          supportGoalDescription: data.get('supportGoalDescription'),
          terms: data.get('terms'),
          analyticsCode: analyticsMode === 'google' ? (measurementId.trim() ? googleAnalyticsCode(measurementId.trim()) : '') : analyticsCode,
        }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        showToast(result.error || 'Unable to save page settings.')
        return
      }
      showToast('Page settings saved.', 'success')
    } catch {
      showToast('Unable to reach the settings service. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return <form onSubmit={save}>
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="page-theme-color">Theme color</FieldLabel>
        <Input id="page-theme-color" name="themeColor" type="color" defaultValue={page?.themeColor ?? '#111111'} className="h-11 w-16 p-1" />
      </Field>
      <Field>
        <FieldLabel htmlFor="page-welcome-message">Welcome message</FieldLabel>
        <Textarea id="page-welcome-message" name="welcomeMessage" rows={4} defaultValue={page?.welcomeMessage ?? ''} />
      </Field>

      <Field>
        <FieldLabel htmlFor="page-default-support">Default support amount</FieldLabel>
        <Input id="page-default-support" name="defaultSupportAmount" type="number" min="1" max="1000000" step="1" defaultValue={(page?.defaultSupportAmount ?? 500) / divisor} />
      </Field>
      <FieldSet>
        <FieldLegend variant="label">Visibility</FieldLegend>
        <FieldGroup>
          <Field orientation="horizontal"><Checkbox id="allow-anonymous" checked={toggles.allowAnonymous} onCheckedChange={(checked) => setToggle('allowAnonymous', checked === true)} /><FieldLabel htmlFor="allow-anonymous">Allow anonymous support</FieldLabel></Field>
          <Field orientation="horizontal"><Checkbox id="show-support" checked={toggles.showSupport} onCheckedChange={(checked) => setToggle('showSupport', checked === true)} /><FieldLabel htmlFor="show-support">Show support form</FieldLabel></Field>
          <Field orientation="horizontal"><Checkbox id="show-shop" checked={toggles.showShop} onCheckedChange={(checked) => setToggle('showShop', checked === true)} /><FieldLabel htmlFor="show-shop">Show shop</FieldLabel></Field>
        </FieldGroup>
      </FieldSet>
      <FieldSeparator />
      <FieldSet>
        <FieldLegend>Support goal</FieldLegend>
        <FieldDescription>Show supporters what you are working toward.</FieldDescription>
        <FieldGroup>
          <Field orientation="horizontal"><Checkbox id="show-support-goal" checked={toggles.supportGoalEnabled} onCheckedChange={(checked) => setToggle('supportGoalEnabled', checked === true)} /><FieldLabel htmlFor="show-support-goal">Show support goal</FieldLabel></Field>
          <Field><FieldLabel htmlFor="support-goal-title">Goal title</FieldLabel><Input id="support-goal-title" name="supportGoalTitle" defaultValue={page?.supportGoalTitle ?? ''} placeholder="Support open source development" /></Field>
          <Field><FieldLabel htmlFor="support-goal-amount">Goal amount</FieldLabel><Input id="support-goal-amount" name="supportGoalAmount" type="number" min="1" step="1" defaultValue={page?.supportGoalAmount ? page.supportGoalAmount / divisor : ''} placeholder="100" /></Field>
          <Field><FieldLabel htmlFor="support-goal-description">Goal description</FieldLabel><Textarea id="support-goal-description" name="supportGoalDescription" rows={4} defaultValue={page?.supportGoalDescription ?? ''} placeholder="Tell supporters what this goal will fund." /></Field>
        </FieldGroup>
      </FieldSet>
      <Field><FieldLabel htmlFor="page-terms">Terms</FieldLabel><Textarea id="page-terms" name="terms" rows={5} defaultValue={page?.terms ?? ''} /></Field>
      <FieldSet>
        <FieldLegend>Analytics</FieldLegend>
        <FieldDescription>Add tracking code to the public homepage, posts, and shop pages.</FieldDescription>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="analytics-mode">Provider</FieldLabel>
            <NativeSelect id="analytics-mode" className="w-full [&_select]:h-11.25" value={analyticsMode} onChange={(event) => changeAnalyticsMode(event.target.value as AnalyticsMode)}>
              <NativeSelectOption value="google">Google Analytics</NativeSelectOption><NativeSelectOption value="custom">Insert code</NativeSelectOption>
            </NativeSelect>
          </Field>
          {analyticsMode === 'google' ? <Field><FieldLabel htmlFor="google-analytics-id">Google Analytics ID</FieldLabel><Input id="google-analytics-id" value={measurementId} onChange={(event) => setMeasurementId(event.target.value)} placeholder="G-XXXXXXXXXX" /><FieldDescription>Leave blank to disable analytics.</FieldDescription></Field> : <Field><FieldLabel htmlFor="analytics-code">Code inserted into &lt;head&gt;</FieldLabel><Textarea id="analytics-code" value={analyticsCode} onChange={(event) => setAnalyticsCode(event.target.value)} rows={10} spellCheck={false} className="font-mono text-xs" /><FieldDescription>Leave blank to disable analytics. This code runs for public-site visitors.</FieldDescription></Field>}
        </FieldGroup>
      </FieldSet>
      <Button className="w-full sm:w-auto" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save page settings'}</Button>
    </FieldGroup>
  </form>
}
