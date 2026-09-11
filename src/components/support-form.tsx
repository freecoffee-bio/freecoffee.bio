import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'
import { SiPaypal, SiStripe } from '@icons-pack/react-simple-icons'
import { ArrowLeft, Coffee, Info, LockKeyhole, Mail, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { showToast } from '@/lib/toast'

type SupportFormProps = {
  creator: { name: string; allowAnonymous?: boolean; paymentProviders?: { stripe: boolean; paypal: boolean } }
  currentUser?: { name: string; email: string } | null
  defaultSupportAmount?: number
  suggestedSupportAmounts?: string | null
  minimumSupportAmount?: number
  supportWording?: 'tip' | 'donate'
  currency?: string
  onSubmitted: (email: string, amount: number) => void
}

const schema = z.object({
  amount: z.string().min(1, 'Enter an amount of at least $1.').refine((value) => Number.isFinite(Number(value)) && Number(value) >= 1, 'Enter an amount of at least $1.').refine((value) => Number(value) <= 1000, 'The maximum support amount is $1,000.'),
  email: z.email('Enter a valid receipt email.'),
  displayName: z.string().max(100, 'Display name is too long.').optional(),
  message: z.string().max(240, 'Message must be 240 characters or fewer.').optional(),
  anonymous: z.boolean(),
  provider: z.enum(['stripe', 'paypal']),
})

type FormValues = z.infer<typeof schema>

export function SupportForm({ creator, currentUser, defaultSupportAmount = 500, suggestedSupportAmounts, minimumSupportAmount = 100, supportWording = 'donate', currency = 'USD', onSubmitted }: SupportFormProps) {
  const decimals = currency === 'JPY' ? 0 : 2
  const factor = 10 ** decimals
  const symbol = currency === 'USD' ? '$' : currency
  const minimumAmount = minimumSupportAmount / factor
  let quickAmounts = [300, 500, 1000]
  try {
    const parsed = JSON.parse(suggestedSupportAmounts ?? '')
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((value) => Number.isSafeInteger(value) && value > 0)) quickAmounts = parsed
  } catch {}
  const quickAmountValues = quickAmounts.map((value) => String(value / factor))
  const supportLabel = supportWording === 'tip' ? 'Tip' : 'Donate'
  const providers = creator.paymentProviders ?? { stripe: false, paypal: false }
  const availableProviders = (['stripe', 'paypal'] as const).filter((provider) => providers[provider])
  const defaultProvider = availableProviders[0] ?? 'stripe'
  const [step, setStep] = useState<1 | 2>(1)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: String(defaultSupportAmount / factor),
      email: currentUser?.email ?? '',
      displayName: currentUser?.name ?? '',
      message: '',
      anonymous: false,
      provider: defaultProvider,
    },
  })

  const amount = Number(form.watch('amount') || 0)

  async function continueToEmail() {
    const valid = await form.trigger(['amount', 'displayName', 'message', 'anonymous'])
    if (!valid) return
    if (Number(form.getValues('amount')) < minimumAmount) {
      form.setError('amount', { message: `Enter an amount of at least ${symbol} ${minimumAmount}.` })
      return
    }
    setStep(2)
  }

  async function onSubmit(values: FormValues) {
    try {
      const response = await fetch('/api/support/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: values.amount, provider: values.provider, email: values.email, displayName: values.displayName, message: values.message, anonymous: values.anonymous }),
      })
      const result = await response.json() as { checkoutUrl?: string; error?: string }
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error || 'Unable to start checkout.')
      onSubmitted(values.email, Number(values.amount))
      window.location.href = result.checkoutUrl
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to start checkout.')
    }
  }

  return <TooltipProvider><form className="rounded-xl border bg-card p-5 shadow-sm" onSubmit={form.handleSubmit(onSubmit)} noValidate>
    {step === 1 ? <>
      <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-1.5 font-mono text-sm text-primary"><Coffee className="size-4" /> Buy me a coffee</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Support {creator.name}</h2></div><span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 font-mono text-xs text-primary"><LockKeyhole className="size-4" /> secure</span></div>
      <div className="mt-5 grid grid-cols-2 rounded-full bg-muted p-1 text-center text-sm font-semibold"><span className="rounded-full bg-card px-4 py-2 shadow-sm">One-time</span><span className="flex items-center justify-center gap-1.5 px-4 py-2 text-muted-foreground">Monthly <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Monthly support information" className="inline-flex size-4 items-center justify-center rounded-full hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Info className="size-3.5" /></button></TooltipTrigger><TooltipContent><p>Monthly support is not available yet.</p></TooltipContent></Tooltip></span></div>
      <FieldGroup className="mt-5">
        <Controller name="amount" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="support-amount">Choose amount</FieldLabel><div className="grid grid-cols-3 gap-2">{quickAmountValues.map((value) => <Button key={value} type="button" variant={field.value === value ? 'outline' : 'secondary'} className={field.value === value ? 'border-foreground' : ''} onClick={() => field.onChange(value)}>{field.value === value && <span className="text-primary">✓</span>} {symbol} {value}</Button>)}</div><div className="relative mt-1"><span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted-foreground">{symbol}</span><Input {...field} id="support-amount" type="number" min={minimumAmount} max="1000" step={decimals === 0 ? 1 : 0.01} className="pl-9" placeholder="Enter an amount" aria-invalid={fieldState.invalid} /></div>{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} />
        <Controller name="displayName" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="support-name">Display name <span className="font-normal text-muted-foreground">optional</span></FieldLabel><Input {...field} id="support-name" disabled={form.watch('anonymous')} aria-invalid={fieldState.invalid} placeholder="Your name" />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} />
        <Controller name="message" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="support-message">Message <span className="font-normal text-muted-foreground">optional</span></FieldLabel><Textarea {...field} id="support-message" rows={3} maxLength={240} aria-invalid={fieldState.invalid} placeholder="Say something nice..." />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} />
        {creator.allowAnonymous !== false && <Controller name="anonymous" control={form.control} render={({ field }) => <Field><div className="flex items-center gap-2"><Checkbox id="support-anonymous" checked={field.value} onCheckedChange={field.onChange} /><FieldLabel htmlFor="support-anonymous" className="flex items-center gap-1.5 font-medium">Private message <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Private message information" className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Info className="size-3.5" /></button></TooltipTrigger><TooltipContent><p>Only the creator will see your message.</p></TooltipContent></Tooltip></FieldLabel></div></Field>} />}
        <Button className="w-full" size="lg" type="button" onClick={() => void continueToEmail()}>{supportLabel} <Send className="size-4" data-icon="inline-end" /></Button>
      </FieldGroup>
    </> : <>
      <div className="flex items-center gap-2"><Button type="button" variant="ghost" size="icon" aria-label="Go back" onClick={() => setStep(1)}><ArrowLeft className="size-4" /></Button><h2 className="text-2xl font-semibold tracking-tight">Your email address</h2></div>
      <FieldGroup className="mt-6">
        <Controller name="email" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="support-email">Email</FieldLabel><Input {...field} id="support-email" type="email" aria-invalid={fieldState.invalid} placeholder="you@example.com" />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} />
        <div className="rounded-lg bg-muted p-3 text-sm leading-5 text-muted-foreground"><p>You are supporting {creator.name} directly. Tips are voluntary and freely given.</p><p className="mt-2 flex items-center gap-1.5"><Mail className="size-4 shrink-0" /> Your receipt will be sent to this email.</p></div>
        {!availableProviders.length ? <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Payment is temporarily unavailable. Please try again later.</p> : <Controller name="provider" control={form.control} render={({ field, fieldState }) => <FieldSet data-invalid={fieldState.invalid}><FieldLegend variant="label">Payment method</FieldLegend><RadioGroup name={field.name} value={field.value} onValueChange={field.onChange} disabled={form.formState.isSubmitting} aria-invalid={fieldState.invalid} className="grid grid-cols-1 gap-2">{providers.stripe && <FieldLabel htmlFor="support-provider-stripe"><Field orientation="horizontal"><FieldContent><div className="flex items-center gap-2 font-medium"><SiStripe className="size-5 text-[#635BFF]" aria-hidden="true" />Credit or debit card</div><p className="text-sm font-normal text-muted-foreground">Pay securely with Stripe.</p></FieldContent><RadioGroupItem value="stripe" id="support-provider-stripe" /></Field></FieldLabel>}{providers.paypal && <FieldLabel htmlFor="support-provider-paypal"><Field orientation="horizontal"><FieldContent><div className="flex items-center gap-2 font-medium"><SiPaypal className="size-5 text-[#003087]" aria-hidden="true" />PayPal</div><p className="text-sm font-normal text-muted-foreground">Pay with your PayPal account.</p></FieldContent><RadioGroupItem value="paypal" id="support-provider-paypal" /></Field></FieldLabel>}</RadioGroup>{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</FieldSet>} /> }
        <Button className="w-full" size="lg" type="submit" disabled={form.formState.isSubmitting || !availableProviders.length}><span className="flex-1 text-left">{form.formState.isSubmitting ? 'Opening secure checkout...' : 'Continue to payment'}</span>{symbol}{amount.toFixed(decimals)}<Send className="size-4" data-icon="inline-end" /></Button>
        <p className="text-center text-xs text-muted-foreground">Payment is completed securely by the selected provider.</p>
      </FieldGroup>
    </>}
  </form></TooltipProvider>
}
