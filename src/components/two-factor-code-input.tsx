import { useState } from 'react'
import { REGEXP_ONLY_DIGITS } from 'input-otp'

import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

const slotClassName = 'h-11 w-10 text-base'

export function TwoFactorCodeInput({
  id = 'two-factor-code',
  name = 'code',
  disabled,
  onChange,
  onComplete,
  autoSubmit = false,
}: {
  id?: string
  name?: string
  disabled?: boolean
  onChange?: (value: string) => void
  onComplete?: (value: string) => void
  autoSubmit?: boolean
}) {
  const [value, setValue] = useState('')

  function handleChange(next: string) {
    setValue(next)
    onChange?.(next)
    if (next.length === 6) {
      onComplete?.(next)
      if (autoSubmit) (document.activeElement as HTMLElement | null)?.closest('form')?.requestSubmit()
    }
  }

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <InputOTP
        id={id}
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        autoComplete="one-time-code"
        inputMode="numeric"
        containerClassName="w-full"
      >
        <InputOTPGroup className="w-full">
          <InputOTPSlot index={0} className={`${slotClassName} flex-1`} />
          <InputOTPSlot index={1} className={`${slotClassName} flex-1`} />
          <InputOTPSlot index={2} className={`${slotClassName} flex-1`} />
          <InputOTPSlot index={3} className={`${slotClassName} flex-1`} />
          <InputOTPSlot index={4} className={`${slotClassName} flex-1`} />
          <InputOTPSlot index={5} className={`${slotClassName} flex-1`} />
        </InputOTPGroup>
      </InputOTP>
    </>
  )
}
