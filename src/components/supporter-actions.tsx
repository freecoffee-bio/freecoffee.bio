import { useState } from 'react'
import { KeyRound, Trash2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { showToast } from '@/lib/toast'

type Props = {
  userId: string
  name: string
  email: string
}

type UserActionResult = {
  error?: string
}

export function SupporterActions({ userId, name, email }: Props) {
  const [resetOpen, setResetOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')

  function closeResetDialog() {
    setResetOpen(false)
    setPassword('')
    setConfirmation('')
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.length < 8 || password.length > 128) {
      showToast('Password must be 8-128 characters.')
      return
    }
    if (confirmation !== password) {
      showToast('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reset-password', userId, password }),
      })
      const result = await response.json().catch(() => ({})) as UserActionResult
      if (!response.ok) throw new Error(result.error || 'Unable to reset password.')
      closeResetDialog()
      showToast('Password reset. The user must sign in again.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to reset password.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteUser(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', userId }),
      })
      const result = await response.json().catch(() => ({})) as UserActionResult
      if (!response.ok) throw new Error(result.error || 'Unable to delete user.')
      setDeleteOpen(false)
      window.location.reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to delete user.')
      setBusy(false)
    }
  }

  return <>
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setResetOpen(true)} disabled={busy}>
        <KeyRound data-icon="inline-start" />
        Reset password
      </Button>
      <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} disabled={busy}>
        <Trash2 data-icon="inline-start" />
        Delete
      </Button>
    </div>

    <Dialog open={resetOpen} onOpenChange={(open) => open ? setResetOpen(true) : closeResetDialog()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a new password for {email}. This will sign the user out of their existing sessions.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => void resetPassword(event)}>
          <label className="grid gap-2 text-sm font-medium" htmlFor={`password-${userId}`}>
            New password
            <Input id={`password-${userId}`} type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor={`password-confirmation-${userId}`}>
            Confirm new password
            <Input id={`password-confirmation-${userId}`} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeResetDialog} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Resetting...' : 'Reset password'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>This permanently deletes the user and their sign-in access. This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={(event) => void deleteUser(event)}>{busy ? 'Deleting...' : 'Delete user'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
