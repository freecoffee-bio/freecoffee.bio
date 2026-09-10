import { useEffect, useState, type FormEvent } from 'react'
import { MessageCircle, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { showToast } from '@/lib/toast'

type Comment = { id: string; body: string; createdAt: string | Date; userName?: string | null }

export function PostComments({
  postId,
  currentUser,
}: {
  postId: string
  currentUser: { name: string; email: string } | null
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/comments?type=post&id=${encodeURIComponent(postId)}`)
      .then((response) => response.ok ? response.json() : { comments: [] })
      .then((result) => {
        const data = result as { comments?: Comment[] }
        setComments(data.comments ?? [])
      })
      .catch(() => setComments([]))
  }, [postId])

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!comment.trim() || busy) return
    setBusy(true)
    try {
      const response = await fetch('/api/comments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'post', id: postId, body: comment }) })
      const result = await response.json().catch(() => ({})) as { comment?: Comment; error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to add comment.')
      if (result.comment) setComments((current) => [...current, result.comment as Comment])
      setComment('')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to add comment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-7">
      <div className="mb-4 flex items-center gap-2 font-medium">
        <MessageCircle className="size-4 text-primary" />
        Comments <span className="text-sm text-muted-foreground">({comments.length})</span>
      </div>
      {comments.length ? (
        <div className="mb-5 flex flex-col gap-4">
          {comments.map((item) => (
            <div className="rounded-lg bg-muted/60 p-3" key={item.id}>
              <p className="text-sm font-medium">{item.userName || 'Member'}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-5 text-sm text-muted-foreground">No comments yet.</p>
      )}
      {currentUser ? (
        <form className="flex gap-2" onSubmit={submitComment}>
          <Textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} maxLength={2000} placeholder="Write a comment..." />
          <Button type="submit" size="icon" disabled={busy || !comment.trim()} aria-label="Send comment"><Send className="size-4" /></Button>
        </form>
      ) : (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          <a className="font-medium text-primary hover:underline" href={`/login?redirect=${encodeURIComponent(`/posts/${postId}`)}`}>Sign in</a>
          {' '}or{' '}
          <a className="font-medium text-primary hover:underline" href={`/register?redirect=${encodeURIComponent(`/posts/${postId}`)}`}>create an account</a>
          {' '}to leave a comment.
        </div>
      )}
    </section>
  )
}
