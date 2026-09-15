import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, Image as ImageIcon, MessageCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export type ContentDialogComment = { id: string; body: string; createdAt: string | Date; userName?: string | null }
type GalleryImage = { id: string; imageUrl: string; title: string }
type ContentDialogProps = {
  type: 'gallery' | 'post'
  id: string
  title: string
  description?: string | null
  body?: string
  coverImageUrl?: string | null
  images?: GalleryImage[]
  currentUser?: { name: string; email: string } | null
}

export function ContentDialog({ type, id, title, description, body, coverImageUrl, images = [], currentUser }: ContentDialogProps) {
  const [open, setOpen] = useState(false)
  const [activeImage, setActiveImage] = useState(0)
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [comments, setComments] = useState<ContentDialogComment[]>([])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const preloadedImages = useRef(new Map<string, HTMLImageElement>())
  useEffect(() => {
    if (!open) return
    setActiveImage(0)
    setImageLoading(type === 'gallery' && images.length > 0)
    setImageError(false)

    if (type === 'gallery') preloadNextImage(0)
    fetch(`/api/comments?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`)
      .then((response) => response.ok ? response.json() : { comments: [] })
      .then((result) => { const data = result as { comments?: ContentDialogComment[] }; setComments(data.comments ?? []) })
      .catch(() => setComments([]))
  }, [open, type, id])

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!comment.trim() || busy) return
    setBusy(true)
    try {
      const response = await fetch('/api/comments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, id, body: comment }) })
      const result = await response.json().catch(() => ({})) as { comment?: ContentDialogComment; error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to add comment.')
      if (result.comment) setComments((current) => [...current, result.comment as ContentDialogComment])
      setComment('')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to add comment.')
    } finally {
      setBusy(false)
    }
  }

  function preloadNextImage(index: number) {
    const nextImage = images[index + 1]
    if (!nextImage) return
    if (preloadedImages.current.has(nextImage.imageUrl)) return
    const preload = new window.Image()
    preload.decoding = 'async'
    preload.loading = 'eager'
    preloadedImages.current.set(nextImage.imageUrl, preload)

    preload.src = nextImage.imageUrl
  }

  function isCurrentImage(element: HTMLImageElement, index: number) {
    const expectedUrl = new URL(images[index]?.imageUrl ?? '', window.location.href).href
    return element.currentSrc === expectedUrl || element.src === expectedUrl
  }

  function handleImageLoad(element: HTMLImageElement, index: number) {
    const current = isCurrentImage(element, index)
    if (!current) return
    setImageLoading(false)
    setImageError(false)
    preloadNextImage(index)
  }

  function handleImageError(element: HTMLImageElement, index: number) {
    const current = isCurrentImage(element, index)
    if (!current) return
    setImageLoading(false)
    setImageError(true)
  }

  function moveImageFromPointer(event: React.PointerEvent<HTMLButtonElement>, direction: number) {
    event.preventDefault()
    moveImage(direction)
  }

  function moveImageFromKeyboard(event: React.MouseEvent<HTMLButtonElement>, direction: number) {
    if (event.detail === 0) moveImage(direction)
  }

  function moveImage(direction: number) {
    if (imageLoading) return
    const nextIndex = Math.min(Math.max(activeImage + direction, 0), images.length - 1)
    if (nextIndex === activeImage) {
      return
    }
    setImageLoading(true)
    setImageError(false)
    setActiveImage(nextIndex)
  }


  return <>
    <button type="button" className="block w-full text-left" onClick={() => setOpen(true)} aria-label={`Open ${title}`}>
      {type === 'gallery' ? <div className="relative grid aspect-square place-items-center overflow-hidden bg-muted">{images[0] ? <img src={images[0].imageUrl} alt={title} className="size-full object-cover" /> : <ImageIcon className="size-10 text-muted-foreground/60" />}<span className="absolute bottom-2 left-2 rounded-md bg-background/85 px-2 py-1 text-xs font-medium">{images.length} {images.length === 1 ? 'image' : 'images'}</span></div> : <div className="relative grid aspect-square place-items-center overflow-hidden bg-muted">{coverImageUrl ? <img src={coverImageUrl} alt={`${title} cover`} className="size-full object-cover" /> : <FileText className="size-10 text-muted-foreground/60" />}</div>}
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <div className="relative z-10 shrink-0 border-b bg-background px-5 py-4 pr-12 sm:px-7"><DialogHeader><DialogTitle className="truncate">{title}</DialogTitle><DialogDescription className="truncate">{type === 'gallery' ? description || 'Gallery album' : description || 'Post'}</DialogDescription></DialogHeader></div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {type === 'gallery' && images.length > 0 && <div className="relative h-[min(62vh,calc(100vw-2rem))] overflow-hidden bg-black"><img src={images[activeImage].imageUrl} alt={images[activeImage].title || title} decoding="async" className="size-full object-contain" onLoad={(event) => handleImageLoad(event.currentTarget, activeImage)} onError={(event) => handleImageError(event.currentTarget, activeImage)} />{imageLoading && <div className="absolute inset-0 grid place-items-center bg-black/30 text-sm text-white">Loading image…</div>}{imageError && <div className="absolute inset-x-0 bottom-0 bg-destructive/90 px-4 py-2 text-center text-sm text-destructive-foreground">Unable to load this image.</div>}{images.length > 1 && <><Button type="button" variant="secondary" size="icon" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full" onPointerDown={(event) => moveImageFromPointer(event, -1)} onClick={(event) => moveImageFromKeyboard(event, -1)} disabled={imageLoading || activeImage === 0} aria-label="Previous image"><ChevronLeft /></Button><Button type="button" variant="secondary" size="icon" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full" onPointerDown={(event) => moveImageFromPointer(event, 1)} onClick={(event) => moveImageFromKeyboard(event, 1)} disabled={imageLoading || activeImage === images.length - 1} aria-label="Next image"><ChevronRight /></Button><div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{activeImage + 1} / {images.length}</div></>}</div>}
          {type === 'post' && <div className="px-5 py-6 sm:px-7 sm:py-8"><div className="whitespace-pre-wrap text-base leading-8">{body}</div></div>}
          <section className="border-t p-5 sm:p-7"><div className="mb-4 flex items-center gap-2 font-medium"><MessageCircle className="size-4 text-primary" />Comments <span className="text-sm text-muted-foreground">({comments.length})</span></div>{comments.length ? <div className="mb-5 space-y-4">{comments.map((item) => <div className="rounded-lg bg-muted/60 p-3" key={item.id}><p className="text-sm font-medium">{item.userName || 'Member'}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.body}</p></div>)}</div> : <p className="mb-5 text-sm text-muted-foreground">No comments yet.</p>}{currentUser ? <form className="flex gap-2" onSubmit={submitComment}><Textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} maxLength={2000} placeholder="Write a comment..." /><Button type="submit" size="icon" disabled={busy || !comment.trim()} aria-label="Send comment"><Send className="size-4" /></Button></form> : <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground"><a className="font-medium text-primary hover:underline" href="/register">Sign up</a> or <a className="font-medium text-primary hover:underline" href="/login">log in</a> to leave a comment.</div>}</section>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
