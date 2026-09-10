import { useState } from 'react'
import { REGEXP_ONLY_DIGITS } from 'input-otp'

import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'

const slotClassName = 'h-11 w-10 text-base'

export function TwoFactorCodeInput({
  id = 'two-factor-code',
  name = 'code',
  disabled,
  onChange,
}: {
  id?: string
  name?: string
  disabled?: boolean
  onChange?: (value: string) => void
}) {
  const [value, setValue] = useState('')

  function handleChange(next: string) {
    setValue(next)
    onChange?.(next)
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
        containerClassName="w-full justify-between"
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} className={slotClassName} />
          <InputOTPSlot index={1} className={slotClassName} />
          <InputOTPSlot index={2} className={slotClassName} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} className={slotClassName} />
          <InputOTPSlot index={4} className={slotClassName} />
          <InputOTPSlot index={5} className={slotClassName} />
        </InputOTPGroup>
      </InputOTP>
    </>
  )
}
