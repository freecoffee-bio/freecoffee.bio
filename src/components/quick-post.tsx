import { useState, type FormEvent } from 'react'
import { Image, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { showToast } from '@/lib/toast'

export function QuickPost() {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = body.trim()
    if (!content) return
    setBusy(true)
    try {
      const response = await fetch('/api/admin/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'post', title: content.split('\n')[0].slice(0, 160) || 'Quick update', body: content, publish: true }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to publish post.')
      setBody('')
      setOpen(false)
      showToast('Post published.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to publish post.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return <section className="rounded-xl border bg-card p-4 shadow-sm"><button type="button" className="flex w-full items-center gap-3 text-left text-muted-foreground" onClick={() => setOpen(true)}><span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Send className="size-4" /></span><span>Write a quick update...</span></button><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="secondary" size="sm" disabled><Image className="size-4" data-icon="inline-start" /> Image</Button><Button type="button" variant="secondary" size="sm" disabled>Blog post</Button><Button type="button" variant="secondary" size="sm" disabled>Video</Button><Button type="button" variant="secondary" size="sm" disabled>Poll</Button><Button type="button" variant="secondary" size="sm" disabled>Audio</Button></div></section>

  return <section className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex justify-end"><Button type="button" variant="ghost" size="icon" aria-label="Close quick post" onClick={() => setOpen(false)}><X className="size-4" /></Button></div><form onSubmit={submit} className="space-y-3"><Textarea autoFocus value={body} onChange={(event) => setBody(event.target.value)} rows={5} maxLength={20000} placeholder="Write a quick update..." /><Button type="submit" disabled={busy || !body.trim()}>{busy ? 'Posting...' : 'Post'} <Send className="size-4" data-icon="inline-end" /></Button></form></section>
}
