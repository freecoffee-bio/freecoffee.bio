import { useState, type FormEvent } from 'react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { showToast } from '@/lib/toast'

export function ShopTermsEditor({ displayName, initialTerms }: { displayName: string; initialTerms: string }) {
  const [terms, setTerms] = useState(initialTerms)
  const [busy, setBusy] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await fetch('/api/admin/creator', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName, terms }) })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save terms.')
      showToast('Shop terms saved.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save terms.')
    } finally {
      setBusy(false)
    }
  }

  return <form className="shop-terms-form" onSubmit={(event) => void save(event)}><Textarea value={terms} onChange={(event) => setTerms(event.target.value)} rows={5} maxLength={5000} placeholder="For example: refund policy, delivery timing, and licence terms." aria-label="Shop terms" /><div><Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save terms'}</Button></div></form>
}
