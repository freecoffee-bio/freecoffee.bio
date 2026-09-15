import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, MailCheck, Save, UserRound } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { showToast } from '@/lib/toast'

type Profile = { name: string; email: string; image?: string | null }

export function ProfileSettings({ initialProfile }: { initialProfile: Profile }) {
  const [profile, setProfile] = useState(initialProfile)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [changingEmail, setChangingEmail] = useState(false)
  const [emailChangeCooldown, setEmailChangeCooldown] = useState(0)

  useEffect(() => {
    if (emailChangeCooldown <= 0) return
    const timer = window.setInterval(() => setEmailChangeCooldown((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [emailChangeCooldown])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = profile.name.trim()
    if (!name) {
      showToast('Enter a display name.')
      return
    }

    setSavingProfile(true)
    try {
      const response = await fetch('/api/auth/update-user', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, image: profile.image?.trim() || null }) })
      const result = await response.json().catch(() => ({})) as { message?: string }
      if (!response.ok) throw new Error(result.message || 'Unable to save profile.')
      setProfile((current) => ({ ...current, name, image: current.image?.trim() || null }))
      showToast('Profile saved.', 'success')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to save profile.') } finally { setSavingProfile(false) }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const currentPassword = String(form.get('currentPassword') || '')
    const newPassword = String(form.get('newPassword') || '')
    const confirmPassword = String(form.get('confirmPassword') || '')
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match.')
      return
    }

    setSavingPassword(true)
    try {
      const response = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions: true }) })
      const result = await response.json().catch(() => ({})) as { message?: string }
      if (!response.ok) throw new Error(result.message || 'Unable to change password.')
      formElement.reset()
      showToast('Password updated. Other sessions were signed out.', 'success')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to change password.') } finally { setSavingPassword(false) }
  }

  async function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const newEmail = String(form.get('newEmail') || '').trim().toLowerCase()
    if (!newEmail || newEmail === profile.email.toLowerCase()) {
      showToast('Enter a different email address.')
      return
    }

    setChangingEmail(true)
    try {
      const response = await fetch('/api/auth/change-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newEmail, callbackURL: `${window.location.origin}/profile` }),
      })
      const result = await response.json().catch(() => ({})) as { message?: string }
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after'))
        if (response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) setEmailChangeCooldown(retryAfter)
        throw new Error(result.message || 'Unable to request an email change.')
      }
      setEmailChangeCooldown(60)
      showToast('Check your current email to confirm the change.', 'success')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to request an email change.') } finally { setChangingEmail(false) }
  }

  const initials = (profile.name || profile.email).charAt(0).toUpperCase()

  return <div className="flex flex-col gap-7"><section><div className="flex items-center gap-3"><Avatar size="lg"><AvatarImage src={profile.image ?? undefined} alt="" /><AvatarFallback>{initials}</AvatarFallback></Avatar><div><h2 className="text-lg font-semibold">Personal information</h2><p className="text-sm text-muted-foreground">Update the details shown for your account.</p></div></div><form className="mt-6" onSubmit={saveProfile}><FieldGroup><Field><FieldLabel htmlFor="profile-name">Display name</FieldLabel><Input id="profile-name" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} autoComplete="name" required /></Field><Field><FieldLabel htmlFor="profile-email">Email</FieldLabel><Input id="profile-email" value={profile.email} type="email" autoComplete="email" readOnly /><FieldDescription>This is your current sign-in email and cannot be edited here. <a className="underline underline-offset-2" href="#change-email">Change your email address below.</a></FieldDescription></Field><Field><FieldLabel htmlFor="profile-image">Profile image URL</FieldLabel><Input id="profile-image" value={profile.image ?? ''} onChange={(event) => setProfile((current) => ({ ...current, image: event.target.value }))} type="url" placeholder="https://..." autoComplete="url" /><FieldDescription>Leave blank to use your initials.</FieldDescription></Field><Button type="submit" disabled={savingProfile}><Save data-icon="inline-start" />{savingProfile ? 'Saving...' : 'Save profile'}</Button></FieldGroup></form></section><Separator /><section id="change-email"><div><h2 className="text-lg font-semibold">Email address</h2><p className="mt-1 text-sm text-muted-foreground">Changing your email requires confirmation from both your current and new email addresses.</p></div><form className="mt-6" onSubmit={changeEmail}><FieldGroup><Field><FieldLabel htmlFor="new-email">New email address</FieldLabel><Input id="new-email" name="newEmail" type="email" autoComplete="email" required /><FieldDescription>We will first send a confirmation link to {profile.email}.</FieldDescription></Field><Button type="submit" disabled={changingEmail || emailChangeCooldown > 0}><MailCheck data-icon="inline-start" />{changingEmail ? 'Sending confirmation...' : emailChangeCooldown > 0 ? `Resend in ${emailChangeCooldown}s` : 'Change email address'}</Button></FieldGroup></form></section><Separator /><section><div><h2 className="text-lg font-semibold">Password</h2><p className="mt-1 text-sm text-muted-foreground">Use a unique password that you do not use elsewhere.</p></div><form className="mt-6" onSubmit={changePassword}><FieldGroup><Field><FieldLabel htmlFor="current-password">Current password</FieldLabel><Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required /></Field><Field><FieldLabel htmlFor="new-password">New password</FieldLabel><Input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={8} required /><FieldDescription>Use at least 8 characters.</FieldDescription></Field><Field><FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel><Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></Field><Button type="submit" disabled={savingPassword}><KeyRound data-icon="inline-start" />{savingPassword ? 'Updating...' : 'Update password'}</Button></FieldGroup></form></section></div>
}
