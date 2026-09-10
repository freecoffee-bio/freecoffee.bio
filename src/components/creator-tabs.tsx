import { useEffect, useState, type FormEvent } from 'react'

import { BadgeCheck, Coffee, ExternalLink, FileText, Heart, Image as ImageIcon, LockKeyhole, Mail, MessageCircle, MoreHorizontal, Pencil, Share2, ShoppingBag, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { SupportForm } from '@/components/support-form'
import { ContentDialog } from '@/components/content-dialog'
import { QuickPost } from '@/components/quick-post'
import { showToast } from '@/lib/toast'

type Supporter = { name?: string | null; amount: number; message?: string | null; createdAt: string | Date; anonymous: boolean }

function displayAmount(minor: number, currency: string) {
  return (minor / (currency === 'JPY' ? 1 : 100)).toFixed(currency === 'JPY' ? 0 : 2)
}
export type CurrentUser = { name: string; email: string; image?: string | null }
export type Product = { id: string; name: string; description?: string | null; coverImageUrl?: string | null; price: number; currency: string }
type CardCoverProps = { src?: string | null; alt: string; children?: React.ReactNode }
type CardActionsProps = { onEdit: () => void; onDelete: () => void }
type DeleteDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; busy: boolean; onConfirm: () => void }
type EditValues = { title: string; description: string; status: 'published' | 'draft' } | { title: string; excerpt: string; coverImageUrl: string; status: 'published' | 'draft' } | { name: string; description: string; price: string }

type GalleryItem = { id: string; albumId?: string | null; title: string; description?: string | null; imageUrl: string; linkUrl?: string | null; status?: 'published' | 'draft' }
type Post = { id: string; title: string; excerpt?: string | null; coverImageUrl?: string | null; body: string; status?: 'published' | 'draft'; publishedAt?: string | Date | null }
type SupportGoal = { enabled: boolean; title: string; amount: number; description?: string | null; raised: number }
export type Creator = { name: string; currency?: string; bio?: string | null; whatDo?: string | null; image?: string | null; website?: string | null; socialLinks?: string | null; welcomeMessage?: string | null; defaultSupportAmount?: number; terms?: string | null; allowAnonymous?: boolean; showSupport?: boolean; showShop?: boolean; supportGoal?: SupportGoal | null; products?: Product[]; gallery?: GalleryItem[]; posts?: Post[]; supporters?: Supporter[]; paymentProviders?: { stripe: boolean; paypal: boolean } }

type TabProps = {
  creator: Creator
  currentUser: CurrentUser | null
  isAdmin: boolean
}

export function AboutTab({ creator, isAdmin }: TabProps) {
  return <>
    {isAdmin && <QuickPost />}
    {(creator.supportGoal?.enabled || isAdmin) && <SupportGoalCard creator={creator} goal={creator.supportGoal} isAdmin={isAdmin} />}
    <section className="rounded-xl border bg-card p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">About</h2></div><div className="space-y-3 text-base leading-6 text-muted-foreground"><p>{creator.bio || 'This creator has not added a bio yet.'}</p></div></section>
    <section className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">Recent supporters</h2><p className="mt-1 text-base text-muted-foreground">A little kindness goes a long way.</p></div><span className="rounded-full bg-muted px-2 py-1 font-mono text-xs">{creator.supporters?.length ?? 0}</span></div><div className="mt-4 divide-y">{creator.supporters?.length ? creator.supporters.map((supporter) => { const name = supporter.anonymous ? 'Anonymous' : supporter.name || 'Supporter'; return <div className="flex gap-3 py-4 first:pt-0 last:pb-0" key={`${name}-${supporter.createdAt}`}><span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-sm text-primary">{supporter.anonymous ? '?' : name[0]}</span><div className="min-w-0 text-base"><p className="text-muted-foreground"><strong className="text-foreground">{name}</strong> sent {(supporter.amount / 100).toFixed(2)} {creator.currency ?? 'USD'}</p>{supporter.message && <p className="mt-1">“{supporter.message}”</p>}</div><Coffee className="ml-auto size-4 shrink-0 text-primary" /></div>}) : <p className="py-4 text-base text-muted-foreground">No public supporters yet.</p>}</div></section>
  </>
}

export function AboutSupportPanel({ creator, currentUser, isAdmin }: TabProps) {
  const [submitted, setSubmitted] = useState(false)
  const [receiptEmail, setReceiptEmail] = useState('')
  const [supportAmount, setSupportAmount] = useState('0')

  function resetSupport() {
    setSubmitted(false)
    setReceiptEmail('')
    setSupportAmount('0')
  }

  return <aside className="space-y-4 lg:sticky lg:top-5">
    {creator.showSupport === false ? <section className="rounded-xl border bg-card p-5 text-center shadow-sm"><h2 className="text-lg font-semibold">Support is currently unavailable</h2><p className="mt-2 text-base text-muted-foreground">Please check back later.</p></section> : submitted ? <section className="rounded-xl border bg-card p-5 shadow-sm" role="status"><div className="flex items-start justify-between"><div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary"><BadgeCheck className="size-5" /></div><button className="text-muted-foreground hover:text-foreground" type="button" onClick={resetSupport} aria-label="Close confirmation"><X className="size-4" /></button></div><h2 className="mt-4 text-2xl font-semibold tracking-tight">Thanks for supporting {creator.name}.</h2><p className="mt-2 text-base leading-6 text-muted-foreground">Your one-time support of {supportAmount} {creator.currency ?? 'USD'} is ready for secure payment.</p><div className="mt-5 rounded-lg bg-muted p-4 text-base"><p className="flex items-center gap-2 font-medium"><Mail className="size-4 text-primary" /> Receipt email</p><p className="mt-1 text-muted-foreground">A payment receipt and confirmation will be sent to <strong className="text-foreground">{receiptEmail}</strong>.</p></div><Button className="mt-5 w-full" size="lg" type="button" onClick={resetSupport}>Make another support</Button>{creator.terms && <p className="mt-4 text-base leading-6 text-muted-foreground">{creator.terms}</p>}</section> : <SupportForm creator={creator} currentUser={currentUser} currency={creator.currency} defaultSupportAmount={creator.defaultSupportAmount} onSubmitted={(email, amount) => { setReceiptEmail(email); setSupportAmount(String(amount)); setSubmitted(true) }} />}
    <section className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex gap-2"><Sparkles className="size-4 shrink-0 text-primary" /><div><h2 className="text-sm font-semibold">When do I need an account?</h2><p className="mt-1 text-base leading-6 text-muted-foreground">Not for a one-time coffee. Create one only when you need to manage something.</p></div></div><ul className="mt-3 space-y-2 text-base leading-6 text-muted-foreground"><li className="flex gap-2"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><span>Unlock supporter-only posts using the same email as payment.</span></li><li className="flex gap-2"><Heart className="mt-0.5 size-4 shrink-0 text-primary" /><span>Manage monthly memberships, invoices, or cancellation.</span></li><li className="flex gap-2"><ShoppingBag className="mt-0.5 size-4 shrink-0 text-primary" /><span>Access Shop purchases and your support history.</span></li></ul>{!currentUser && <a className="mt-4 inline-flex text-xs font-medium text-primary hover:underline" href="/register">Create a free account <ExternalLink className="ml-1 size-3" /></a>}</section>
    <div className="flex gap-2 rounded-xl bg-primary/5 p-4 text-base text-muted-foreground"><LockKeyhole className="size-4 shrink-0 text-primary" /><p><strong className="text-foreground">Direct support.</strong> FreeCoffee takes 0% platform fees. Support goes to the creator's configured account.</p></div>
  </aside>
}

export function GalleryTab({ creator, isAdmin, currentUser }: Pick<TabProps, 'creator' | 'isAdmin' | 'currentUser'>) {
  const albums = groupGalleryAlbums(creator.gallery ?? [])
  const [editing, setEditing] = useState<(typeof albums)[number] | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function saveAlbum(values: EditValues) {
    if (!editing) return
    setBusy(true)
    if ('description' in values && 'title' in values) await updateContent('gallery', editing.id, values as Record<string, string>)
    setBusy(false)
  }
  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    await deleteAdminContent('gallery', deleting)
    setBusy(false)
  }
  return <>
    {isAdmin && <AddGalleryDialog />}
    {albums.length ? <section className="grid justify-items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">{albums.map((album) => <article className="relative flex aspect-[300/379] w-full max-w-[300px] flex-col overflow-hidden rounded-xl border bg-card shadow-sm" key={album.id}><div className="relative"><ContentDialog type="gallery" id={album.id} title={album.title} description={album.description} images={album.images} currentUser={currentUser} />{isAdmin && album.status === 'draft' && <Badge className="absolute bottom-2 right-2 border-primary bg-primary text-primary-foreground">Draft</Badge>}</div>{isAdmin && <CardActions onEdit={() => setEditing(album)} onDelete={() => setDeleting(album.id)} />}<div className="min-h-0 flex-1 overflow-hidden p-4"><h2 className="truncate font-semibold">{album.title}</h2>{album.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{album.description}</p>}</div></article>)}</section> : <Placeholder title="Gallery" text="This creator has not published any work yet." />}
    {editing && <EditContentDialog key={editing.id} type="gallery" item={editing} open={!!editing} onOpenChange={(open) => !open && setEditing(null)} busy={busy} onSubmit={saveAlbum} />}
    <DeleteDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)} title="Delete album?" description="This will permanently delete the album and all of its images." busy={busy} onConfirm={() => void confirmDelete()} />
  </>
}

function groupGalleryAlbums(items: GalleryItem[]) {
  const albums = new Map<string, { id: string; title: string; description?: string | null; status?: 'published' | 'draft'; images: GalleryItem[] }>()
  for (const item of items) {
    const id = item.albumId ?? item.id
    const album = albums.get(id)
    if (album) album.images.push(item)
    else albums.set(id, { id, title: item.title, description: item.description, status: item.status, images: [item] })
  }
  return [...albums.values()]
}

export function PostsTab({ creator, isAdmin, currentUser }: Pick<TabProps, 'creator' | 'isAdmin' | 'currentUser'>) {
  const [editing, setEditing] = useState<Post | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function savePost(values: EditValues) {
    if (!editing) return
    setBusy(true)
    if ('excerpt' in values) await updateContent('post', editing.id, values)
    setBusy(false)
  }
  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    await deleteAdminContent('post', deleting)
    setBusy(false)
  }
  return <>
    {isAdmin && <AddPostDialog />}
    {creator.posts?.length ? <section className="grid justify-items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">{creator.posts.map((post) => { const href = `/posts/${encodeURIComponent(post.id)}`; return <article className="relative flex aspect-[300/379] w-full max-w-[300px] flex-col overflow-hidden rounded-xl border bg-card shadow-sm" key={post.id}><a href={href} className="flex min-h-0 flex-1 flex-col" aria-label={post.title}><div className="relative"><CardCover src={post.coverImageUrl} alt={`${post.title} cover`}><FileText className="size-10 text-muted-foreground/60" /></CardCover>{isAdmin && post.status === 'draft' && <Badge className="absolute bottom-2 right-2 border-primary bg-primary text-primary-foreground">Draft</Badge>}</div><div className="min-h-0 flex-1 overflow-hidden p-4"><p className="font-mono text-xs text-muted-foreground">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : ''}</p><h2 className="mt-2 truncate text-lg font-semibold">{post.title}</h2><p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{post.excerpt || post.body}</p></div></a>{isAdmin && <CardActions onEdit={() => setEditing(post)} onDelete={() => setDeleting(post.id)} />}</article> })}</section> : <Placeholder title="Posts" text="This creator has not published any posts yet." />}
    {editing && <EditContentDialog key={editing.id} type="post" item={editing} open={!!editing} onOpenChange={(open) => !open && setEditing(null)} busy={busy} onSubmit={savePost} />}
    <DeleteDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)} title="Delete post?" description="This will permanently delete this post." busy={busy} onConfirm={() => void confirmDelete()} />
  </>
}

export function ShopTab({ creator, currentUser, isAdmin }: Pick<TabProps, 'creator' | 'currentUser' | 'isAdmin'>) {
  const [editing, setEditing] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function saveProduct(values: EditValues) {
    if (!editing) return
    setBusy(true)
    if ('name' in values) await updateProduct(editing.id, values)
    setBusy(false)
  }
  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    await deleteProduct(deleting)
    setBusy(false)
  }
  return <>
    {isAdmin && <AddProductDialog />}
    {creator.showShop === false ? <Placeholder title="Shop" text="This creator has hidden their shop." /> : creator.products?.length ? <section className="grid items-start justify-items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">{creator.products.map((product) => <article className="relative flex aspect-[300/379] w-full max-w-[300px] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm" key={product.id}><div className="relative"><a href={`/shop/${encodeURIComponent(product.id)}`} className="block"><CardCover src={product.coverImageUrl} alt={`${product.name} cover`}><ShoppingBag className="size-10 text-muted-foreground/60" /></CardCover></a><div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between gap-2"><span className={`max-w-[62%] truncate rounded-sm border border-white/70 px-2 py-1 text-[11px] font-bold uppercase text-white shadow-sm backdrop-blur-sm ${creator.paymentProviders?.stripe || creator.paymentProviders?.paypal ? 'bg-black/55' : 'bg-black/65'}`}>{creator.paymentProviders?.stripe || creator.paymentProviders?.paypal ? 'Digital' : 'Unavailable'}</span><span className="shrink-0 rounded-sm border border-white/70 bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow-sm">{product.price === 0 ? 'Free +' : `${displayAmount(product.price, product.currency)} ${product.currency}`}</span></div></div>{isAdmin && <CardActions onEdit={() => setEditing(product)} onDelete={() => setDeleting(product.id)} />}<div className="min-h-0 bg-card p-3"><div className="min-w-0"><h2 className="truncate text-lg font-semibold leading-6"><a href={`/shop/${encodeURIComponent(product.id)}`} className="hover:underline">{product.name}</a></h2><p className="mt-1 truncate text-sm leading-5 text-muted-foreground">{product.description || 'Digital download'}</p></div></div></article>)}</section> : <Placeholder title="Shop" text="No products yet. Check back soon for digital tools and resources." />}
    {editing && <EditContentDialog type="product" item={editing} open={!!editing} onOpenChange={(open) => !open && setEditing(null)} busy={busy} onSubmit={saveProduct} />}
    <DeleteDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)} title="Delete product?" description="This will permanently delete this product and its associated files." busy={busy} onConfirm={() => void confirmDelete()} />
  </>
}

function CardCover({ src, alt, children }: CardCoverProps) {
  return <div className="relative grid aspect-square shrink-0 place-items-center overflow-hidden bg-muted">{src ? <img src={src} alt={alt} className="size-full object-cover" /> : children || <ImageIcon className="size-10 text-muted-foreground/60" />}</div>
}

function EditContentDialog({ type, item, open, onOpenChange, busy, onSubmit }: { type: 'gallery' | 'post' | 'product'; item: { title?: string; description?: string | null; excerpt?: string | null; name?: string; price?: number; currency?: string; coverImageUrl?: string | null; status?: 'published' | 'draft' }; open: boolean; onOpenChange: (open: boolean) => void; busy: boolean; onSubmit: (values: EditValues) => Promise<void> }) {
  const [first, setFirst] = useState(type === 'product' ? item.name ?? '' : item.title ?? '')
  const [second, setSecond] = useState(type === 'post' ? item.excerpt ?? '' : item.description ?? '')
  const [status, setStatus] = useState<'published' | 'draft'>(item.status ?? 'published')
  const [coverImageUrl, setCoverImageUrl] = useState(item.coverImageUrl ?? '')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [price, setPrice] = useState(type === 'product' ? String((item.price ?? 0) / (item.currency === 'JPY' ? 1 : 100)) : '')

  useEffect(() => {
    setFirst(type === 'product' ? item.name ?? '' : item.title ?? '')
    setSecond(type === 'post' ? item.excerpt ?? '' : item.description ?? '')
    setStatus(item.status ?? 'published')
    setCoverImageUrl(item.coverImageUrl ?? '')
    setCoverFile(null)
    setPrice(type === 'product' ? String((item.price ?? 0) / (item.currency === 'JPY' ? 1 : 100)) : '')
  }, [item, type, open])

  async function uploadCover() {
    if (!coverFile) return coverImageUrl
    const form = new FormData()
    form.set('file', coverFile)
    form.set('folder', 'post-covers')
    const response = await fetch('/api/admin/media', { method: 'PUT', body: form })
    const result = await response.json().catch(() => ({})) as { error?: string; file?: { publicUrl?: string } }
    if (!response.ok || !result.file?.publicUrl) throw new Error(result.error || 'Unable to upload cover image.')
    setCoverImageUrl(result.file.publicUrl)
    setCoverFile(null)
    return result.file.publicUrl
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!first.trim()) { showToast(type === 'product' ? 'Enter a product name.' : 'Enter a title.'); return }
    if (type === 'product') {
      if (!/^(?:\d+\.?\d*|\.\d+)$/.test(price.trim())) { showToast('Enter a valid price.'); return }
      void onSubmit({ name: first.trim(), description: second.trim(), price: price.trim() })
    } else if (type === 'post') {
      try { void onSubmit({ title: first.trim(), excerpt: second.trim(), coverImageUrl: await uploadCover(), status }) } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to upload cover image.') }
    }
    else void onSubmit({ title: first.trim(), description: second.trim(), status })
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[min(90vh,760px)] flex-col overflow-hidden sm:max-w-xl">
      <DialogHeader className="shrink-0">
        <DialogTitle>{type === 'product' ? 'Edit product' : `Edit ${type}`}</DialogTitle>
        <DialogDescription>{type === 'product' ? 'Update the details buyers see before downloading your digital product.' : `Update this ${type} using the fields below.`}</DialogDescription>
      </DialogHeader>
      <form className="flex min-h-0 flex-1 flex-col gap-5" onSubmit={submit}>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          <FieldGroup>
            <Field><FieldLabel htmlFor="edit-content-title">{type === 'product' ? 'Name' : type === 'post' ? 'Post title' : 'Album title'}</FieldLabel><Input id="edit-content-title" value={first} onChange={(event) => setFirst(event.target.value)} maxLength={160} placeholder={type === 'product' ? 'Product name' : undefined} /></Field>
            <Field><FieldLabel htmlFor="edit-content-description">{type === 'post' ? 'Excerpt' : 'Description'}</FieldLabel><Textarea id="edit-content-description" value={second} onChange={(event) => setSecond(event.target.value)} rows={type === 'product' ? 5 : undefined} placeholder={type === 'product' ? 'Share the details buyers need to know about this item.' : undefined} /></Field>
          </FieldGroup>
          {type === 'post' && <Field><FieldLabel htmlFor="edit-post-cover">Cover image</FieldLabel><FieldDescription>Optional. Shown on the post card. Recommended ratio: 1:1.</FieldDescription><div className="grid aspect-square max-w-48 place-items-center overflow-hidden rounded-lg border border-dashed bg-muted/40">{coverFile ? <img src={URL.createObjectURL(coverFile)} alt="Cover preview" className="size-full object-cover" /> : coverImageUrl ? <img src={coverImageUrl} alt="Cover preview" className="size-full object-cover" /> : <FileText className="size-8 text-muted-foreground/60" />}</div><Input id="edit-post-cover" type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} /></Field>}
          {type === 'product' && <Field><FieldLabel htmlFor="edit-product-price">Price ({item.currency ?? 'USD'})</FieldLabel><FieldDescription>Set the one-time price in the creator's current currency.</FieldDescription><Input id="edit-product-price" value={price} onChange={(event) => setPrice(event.target.value)} type="number" min={0} step={item.currency === 'JPY' ? 1 : 0.01} /></Field>}
          {(type === 'gallery' || type === 'post') && <Field><FieldLabel>Status</FieldLabel><Select value={status} onValueChange={(value) => setStatus(value as 'published' | 'draft')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="published">Published</SelectItem><SelectItem value="draft">Draft</SelectItem></SelectGroup></SelectContent></Select></Field>}
        </div>
        <DialogFooter className="shrink-0 border-t pt-4"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}

function DeleteDialog({ open, onOpenChange, title, description, busy, onConfirm }: DeleteDialogProps) {
  return <AlertDialog open={open} onOpenChange={onOpenChange}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting...' : 'Delete'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
}

function CardActions({ onEdit, onDelete }: CardActionsProps) {
  return <div className="absolute right-2 top-2 z-10"><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label="More options"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-32"><DropdownMenuItem onSelect={onEdit}><Pencil className="size-4" />Edit</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 className="size-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
}

async function updateContent(type: 'gallery' | 'post', id: string, values: Record<string, string>) {
  try {
    const response = await fetch('/api/admin/content', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, id, ...values }) })
    const result = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) throw new Error(result.error || 'Unable to update content.')
    window.location.reload()
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Unable to update content.')
  }
}

async function deleteAdminContent(type: 'gallery' | 'post', id: string) {
  try {
    const response = await fetch('/api/admin/content', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, id }) })
    const result = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) throw new Error(result.error || 'Unable to delete content.')
    window.location.reload()
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Unable to delete content.')
  }
}

async function deleteProduct(id: string) {
  try {
    const response = await fetch('/api/admin/products', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
    const result = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) throw new Error(result.error || 'Unable to delete product.')
    window.location.reload()
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Unable to delete product.')
  }
}

async function updateProduct(id: string, values: { name: string; description: string; price: string }) {
  try {
    const response = await fetch('/api/admin/products', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...values }) })
    const result = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) throw new Error(result.error || 'Unable to update product.')
    window.location.reload()
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Unable to update product.')
  }
}

function AddGalleryDialog() {
  const [open, setOpen] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)

  async function checkStorage() {
    try {
      const response = await fetch('/api/admin/gallery')
      const result = await response.json().catch(() => ({})) as { configured?: boolean; error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to check S3 storage.')
      setConfigured(result.configured === true)
      if (!result.configured) showToast('Configure S3 storage before adding an album.')
    } catch (error) {
      setConfigured(false)
      showToast(error instanceof Error ? error.message : 'Unable to check S3 storage.')
    }
  }

  function openDialog(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) void checkStorage()
  }

  function selectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    const next = [...files, ...selected].slice(0, 8)
    if (files.length + selected.length > 8) showToast('An album can contain up to 8 images.')
    setFiles(next)
    event.target.value = ''
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const status = submitter?.value === 'published' ? 'published' : 'draft'
    if (!configured) {
      showToast('Configure S3 storage before uploading images.')
      return
    }
    if (!title.trim() || !files.length) {
      showToast('Add an album title and at least one image.')
      return
    }
    const form = new FormData()
    form.set('title', title)
    form.set('description', description)
    files.forEach((file) => form.append('images', file))
    form.set('status', status)
    setBusy(true)
    try {
      const response = await fetch('/api/admin/gallery', { method: 'POST', body: form })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to add album.')
      setOpen(false)
      window.location.reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to add album.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="flex justify-end"><Dialog open={open} onOpenChange={openDialog}><DialogTrigger asChild><Button type="button">Add album</Button></DialogTrigger><DialogContent className="flex max-h-[min(90vh,760px)] flex-col overflow-hidden"><DialogHeader className="shrink-0"><DialogTitle>Add album</DialogTitle><DialogDescription>Add up to 8 images to one gallery album.</DialogDescription></DialogHeader><form className="flex min-h-0 flex-1 flex-col gap-5" onSubmit={submit}><div className="min-h-0 flex-1 overflow-y-auto p-1"><FieldGroup><Field><FieldLabel htmlFor="gallery-title">Title</FieldLabel><Input id="gallery-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Album title" /></Field><Field><FieldLabel htmlFor="gallery-description">Description</FieldLabel><Textarea id="gallery-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} placeholder="Describe this album" /></Field></FieldGroup><Field><FieldLabel>Images</FieldLabel><FieldDescription>{files.length} of 8 images{configured === false && <span className="text-destructive"> · S3 is not configured</span>}</FieldDescription><div className="grid grid-cols-4 gap-2 rounded-lg border border-dashed p-3">{files.map((file, index) => <div className="relative aspect-square overflow-hidden rounded-md border" key={`${file.name}-${file.lastModified}-${index}`}><img src={URL.createObjectURL(file)} alt="" className="size-full object-cover" /><Button type="button" variant="ghost" size="icon-sm" className="absolute right-1 top-1 bg-background/90" onClick={() => removeFile(index)} aria-label={`Remove ${file.name}`}><X /></Button></div>)}{files.length < 8 && <label className="grid aspect-square cursor-pointer place-items-center rounded-md border border-dashed text-sm font-semibold hover:bg-muted"><span>Add +</span><Input className="sr-only" type="file" accept="image/*" multiple onChange={selectFiles} disabled={configured !== true || busy} /></label>}</div></Field></div><DialogFooter className="shrink-0 border-t pt-4"><Button type="submit" name="status" value="draft" variant="outline" disabled={busy || configured !== true || !files.length}>Save draft</Button><Button type="submit" name="status" value="published" disabled={busy || configured !== true || !files.length}>{busy ? 'Uploading...' : 'Post album'}</Button></DialogFooter></form></DialogContent></Dialog></div>
}

function AddPostDialog() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [body, setBody] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || !body.trim()) {
      showToast('Enter a post title and content.')
      return
    }
    setBusy(true)
    try {
      let coverImageUrl = ''
      if (coverFile) {
        const form = new FormData()
        form.set('file', coverFile)
        form.set('folder', 'post-covers')
        const upload = await fetch('/api/admin/media', { method: 'PUT', body: form })
        const uploadResult = await upload.json().catch(() => ({})) as { error?: string; file?: { publicUrl?: string } }
        if (!upload.ok || !uploadResult.file?.publicUrl) throw new Error(uploadResult.error || 'Unable to upload cover image.')
        coverImageUrl = uploadResult.file.publicUrl
      }
      const response = await fetch('/api/admin/content', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'post', title, excerpt, body, coverImageUrl, publish: ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'published' }) })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to add post.')
      setOpen(false)
      window.location.reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to add post.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="flex justify-end"><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button">Add post</Button></DialogTrigger><DialogContent className="flex max-h-[min(90vh,760px)] flex-col overflow-hidden"><DialogHeader className="shrink-0"><DialogTitle>Add post</DialogTitle><DialogDescription>Save a new post as a draft.</DialogDescription></DialogHeader><form className="flex min-h-0 flex-1 flex-col gap-5" onSubmit={submit}><div className="min-h-0 flex-1 overflow-y-auto p-1"><FieldGroup><Field><FieldLabel htmlFor="post-title">Title</FieldLabel><Input id="post-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Post title" /></Field><Field><FieldLabel htmlFor="post-excerpt">Excerpt</FieldLabel><Textarea id="post-excerpt" value={excerpt} onChange={(event) => setExcerpt(event.target.value)} rows={3} placeholder="A short summary" /></Field><Field><FieldLabel htmlFor="post-body">Content</FieldLabel><Textarea id="post-body" value={body} onChange={(event) => setBody(event.target.value)} rows={8} maxLength={20000} placeholder="Write your post..." /></Field><Field><FieldLabel htmlFor="post-cover">Cover image</FieldLabel><FieldDescription>Optional. Shown on the post card.</FieldDescription><Input id="post-cover" type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} /></Field></FieldGroup></div><DialogFooter className="shrink-0 border-t pt-4"><Button type="submit" name="status" value="draft" variant="outline" disabled={busy}>Save draft</Button><Button type="submit" name="status" value="published" disabled={busy}>{busy ? 'Adding...' : 'Publish post'}</Button></DialogFooter></form></DialogContent></Dialog></div>
}

function AddProductDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim() || !/^(?:\d+\.?\d*|\.\d+)$/.test(price.trim())) {
      showToast('Enter a product name and a valid price.')
      return
    }
    setBusy(true)
    try {
      const response = await fetch('/api/admin/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, description, price, status: 'draft' }) })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to add product.')
      setOpen(false)
      window.location.reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to add product.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="flex justify-end"><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button">Add product</Button></DialogTrigger><DialogContent className="flex max-h-[min(90vh,760px)] flex-col overflow-hidden"><DialogHeader className="shrink-0"><DialogTitle>Add product</DialogTitle><DialogDescription>Save a digital product as a draft.</DialogDescription></DialogHeader><form className="flex min-h-0 flex-1 flex-col gap-5" onSubmit={submit}><div className="min-h-0 flex-1 overflow-y-auto p-1"><FieldGroup><Field><FieldLabel htmlFor="product-name">Product name</FieldLabel><Input id="product-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} placeholder="Product name" /></Field><Field><FieldLabel htmlFor="product-description">Description</FieldLabel><Textarea id="product-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the digital download" /></Field><Field><FieldLabel htmlFor="product-price">Price (USD)</FieldLabel><Input id="product-price" value={price} onChange={(event) => setPrice(event.target.value)} type="number" min="0" step="0.01" placeholder="10.00" /></Field></FieldGroup></div><DialogFooter className="shrink-0 border-t pt-4"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Adding...' : 'Add product'}</Button></DialogFooter></form></DialogContent></Dialog></div>
}

function SupportGoalCard({ creator, goal, isAdmin }: { creator: Creator; goal?: SupportGoal | null; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(goal?.title ?? '')
  const [amount, setAmount] = useState(goal ? String(goal.amount / 100) : '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const [busy, setBusy] = useState(false)
  const percent = goal ? Math.min(100, Math.round((goal.raised / goal.amount) * 100)) : 0

  async function shareGoal() {
    const url = window.location.href
    if (navigator.share) await navigator.share({ title: goal?.title ?? 'Support goal', url })
    else {
      await navigator.clipboard.writeText(url)
      showToast('Support goal link copied.', 'success')
    }
  }

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const goalAmount = Math.round(Number(amount) * 100)
    if (!title.trim() || !Number.isInteger(goalAmount) || goalAmount < 100) {
      showToast('Enter a goal title and an amount of at least $1.')
      return
    }
    setBusy(true)
    try {
      const response = await fetch('/api/admin/creator', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: creator.name, bio: creator.bio, website: creator.website, socialLinks: creator.socialLinks, supportGoalEnabled: true, supportGoalTitle: title.trim(), supportGoalAmount: String(goalAmount / 100), supportGoalDescription: description.trim() }) })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save support goal.')
      setOpen(false)
      window.location.reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save support goal.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">{goal?.title ?? 'Support goal'}</h2>{!goal && <p className="mt-1 text-sm text-muted-foreground">Set a public goal and let supporters see what their contribution helps fund.</p>}</div><div className="flex gap-2">{goal && <Button type="button" variant="outline" size="icon" aria-label="Share support goal" onClick={() => void shareGoal()}><Share2 className="size-4" /></Button>}{isAdmin && <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button" variant={goal ? 'outline' : 'default'}>{goal ? 'Edit goal' : 'Set a goal'}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{goal ? 'Edit support goal' : 'Set a support goal'}</DialogTitle><DialogDescription>Show supporters what you are working toward.</DialogDescription></DialogHeader><form className="flex flex-col gap-5" onSubmit={saveGoal}><FieldGroup><Field><FieldLabel htmlFor="goal-title">Goal title</FieldLabel><Input id="goal-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Support open source development" maxLength={160} /></Field><Field><FieldLabel htmlFor="goal-amount">Goal amount</FieldLabel><Input id="goal-amount" type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100" /></Field><Field><FieldLabel htmlFor="goal-description">Description</FieldLabel><Textarea id="goal-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="Tell supporters what this goal will fund." /></Field></FieldGroup><Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save goal'}</Button></form></DialogContent></Dialog>}</div></div>{goal && <><Progress className="mt-4 h-2" value={percent} aria-label={`${percent}% of support goal reached`} /><p className="mt-2 text-sm"><strong>{percent}%</strong> of ${(goal.amount / 100).toFixed(2)} goal</p>{goal.description && <p className="mt-3 text-sm leading-6 text-muted-foreground">{goal.description}</p>}</>}</section>
}

function Placeholder({ title, text, className = 'aspect-[300/379] w-full max-w-[300px] min-h-0' }: { title: string; text: string; className?: string }) {
  return <section className={`grid ${className} place-items-center rounded-xl border bg-card p-5 text-center shadow-sm`}><div><MessageCircle className="mx-auto size-8 text-primary" /><h2 className="mt-3 text-lg font-semibold">{title}</h2><p className="mt-1 max-w-sm text-base text-muted-foreground">{text}</p></div></section>
}
