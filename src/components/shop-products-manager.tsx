import { useEffect, useState, type FormEvent } from 'react'
import { Ellipsis, FileText, ImagePlus, Pencil, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle, AttachmentTrigger } from '@/components/ui/attachment'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { showToast } from '@/lib/toast'

export type ShopProduct = { id: string; name: string; description: string | null; coverImageUrl: string | null; price: number; currency: string; status: string }

type Props = { products: ShopProduct[]; currency: string }
type ProductValues = { name: string; description: string; price: string; coverImageUrl: string; file: File | null }

function displayPrice(product: ShopProduct) {
  return `${(product.price / (product.currency === 'JPY' ? 1 : 100)).toFixed(product.currency === 'JPY' ? 0 : 2)} ${product.currency}`
}

function displayFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ShopProductsManager({ products, currency }: Props) {
  const [items, setItems] = useState(products)
  const [editing, setEditing] = useState<ShopProduct | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save(values: ProductValues) {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/products', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...(editing ? { id: editing.id } : { status: 'draft' }), name: values.name, description: values.description, price: values.price, coverImageUrl: values.coverImageUrl }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; product?: ShopProduct }
      if (!response.ok || !result.product) throw new Error(result.error || 'Unable to save product.')

      if (values.file) {
        const files = new FormData()
        files.set('productId', result.product.id)
        files.set('file', values.file)
        const upload = await fetch('/api/admin/files', { method: 'POST', body: files })
        const uploadResult = await upload.json().catch(() => ({})) as { error?: string }
        if (!upload.ok) throw new Error(uploadResult.error || 'Product saved, but the download file could not be uploaded.')
      }

      setItems((current) => editing ? current.map((item) => item.id === result.product!.id ? result.product! : item) : [result.product!, ...current])
      setEditing(null)
      setCreating(false)
      showToast(editing ? 'Product updated.' : 'Product saved as draft.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save product.')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(product: ShopProduct) {
    const status = product.status === 'published' ? 'draft' : 'published'
    setBusy(true)
    try {
      const response = await fetch('/api/admin/products', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: product.id, status }) })
      const result = await response.json().catch(() => ({})) as { error?: string; product?: ShopProduct }
      if (!response.ok || !result.product) throw new Error(result.error || 'Unable to update product status.')
      setItems((current) => current.map((item) => item.id === product.id ? result.product! : item))
      showToast(status === 'published' ? 'Product published.' : 'Product moved to draft.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update product status.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(product: ShopProduct) {
    if (!window.confirm(`Delete ${product.name}?`)) return
    setBusy(true)
    try {
      const response = await fetch('/api/admin/products', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: product.id }) })
      const result = await response.json().catch(() => ({})) as { error?: string; status?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to delete product.')
      setItems((current) => result.status === 'archived' ? current.map((item) => item.id === product.id ? { ...item, status: 'archived' } : item) : current.filter((item) => item.id !== product.id))
      showToast(result.status === 'archived' ? 'Product archived because it has orders.' : 'Product deleted.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to delete product.')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="shop-card-heading"><div><h2>Products</h2><p>Create, price, and publish the digital items in your shop.</p></div><Button className="dark-button" type="button" onClick={() => setCreating(true)}><Plus size={16} /> Add product</Button></div>
    {items.length ? <div className="product-list">{items.map((product) => <article className="product-row" key={product.id}>
      <div className="product-thumb">{product.coverImageUrl ? <img src={product.coverImageUrl} alt="" /> : <ShoppingBag size={22} />}</div>
      <div className="product-copy"><strong>{product.name}</strong><span>Digital download</span><small>{displayPrice(product)}</small></div>
      <span className={`product-status product-status-${product.status}`}>{product.status}</span>
      <div className="product-actions"><Button type="button" variant="outline" onClick={() => setEditing(product)} disabled={busy}><Pencil size={14} /> Edit</Button><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`More options for ${product.name}`}><Ellipsis size={17} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void changeStatus(product)}>{product.status === 'published' ? 'Unpublish' : 'Publish'}</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => void remove(product)}><Trash2 size={14} /> Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    </article>)}</div> : <Empty className="min-h-52 border-0"><EmptyMedia><ShoppingBag aria-hidden="true" /></EmptyMedia><EmptyHeader><EmptyTitle>No products yet</EmptyTitle><EmptyDescription>Create a product to start selling digital downloads.</EmptyDescription></EmptyHeader></Empty>}
    <ProductEditor open={creating || !!editing} product={editing} currency={currency} busy={busy} onOpenChange={(open) => { if (!open) { setCreating(false); setEditing(null) } }} onSubmit={save} />
  </>
}

function FilePicker({ id, accept, disabled, onChange, image = false }: { id: string; accept?: string; disabled: boolean; onChange: (file: File | null) => void; image?: boolean }) {
  const label = image ? 'Choose cover image' : 'Choose download file'
  return <Attachment state="idle" className="w-full"><AttachmentMedia>{image ? <ImagePlus /> : <FileText />}</AttachmentMedia><AttachmentContent><AttachmentTitle>{label}</AttachmentTitle><AttachmentDescription>{image ? 'PNG, JPG, or WebP' : 'Select the file buyers receive'}</AttachmentDescription></AttachmentContent>{!disabled && <AttachmentTrigger asChild><label htmlFor={id} aria-label={label}><Input id={id} className="sr-only" type="file" accept={accept} onChange={(event) => onChange(event.target.files?.[0] ?? null)} /></label></AttachmentTrigger>}</Attachment>
}

function ImageFilePicker({ id, accept, disabled, onChange }: { id: string; accept: string; disabled: boolean; onChange: (file: File | null) => void }) {
  return <FilePicker id={id} accept={accept} disabled={disabled} onChange={onChange} image />
}

function ProductEditor({ open, product, currency, busy, onOpenChange, onSubmit }: { open: boolean; product: ShopProduct | null; currency: string; busy: boolean; onOpenChange: (open: boolean) => void; onSubmit: (values: ProductValues) => Promise<void> }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [downloadFile, setDownloadFile] = useState<File | null>(null)
  const [uploadingCover, setUploadingCover] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(product?.name ?? '')
    setDescription(product?.description ?? '')
    setPrice(product ? String(product.price / (product.currency === 'JPY' ? 1 : 100)) : '')
    setCoverImageUrl(product?.coverImageUrl ?? '')
    setCoverFile(null)
    setDownloadFile(null)
  }, [open, product])

  async function uploadCover() {
    if (!coverFile) return coverImageUrl
    setUploadingCover(true)
    try {
      const form = new FormData()
      form.set('file', coverFile)
      form.set('folder', 'product-covers')
      const response = await fetch('/api/admin/media', { method: 'PUT', body: form })
      const result = await response.json().catch(() => ({})) as { error?: string; file?: { publicUrl?: string } }
      if (!response.ok || !result.file?.publicUrl) throw new Error(result.error || 'Unable to upload cover image.')
      setCoverImageUrl(result.file.publicUrl)
      setCoverFile(null)
      return result.file.publicUrl
    } finally {
      setUploadingCover(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim() || !Number.isFinite(Number(price)) || Number(price) < 0) { showToast('Enter a product name and a valid price.'); return }
    try {
      const uploadedCoverUrl = await uploadCover()
      await onSubmit({ name: name.trim(), description: description.trim(), price, coverImageUrl: uploadedCoverUrl, file: downloadFile })
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save product.')
    }
  }

  const previewUrl = coverFile ? URL.createObjectURL(coverFile) : coverImageUrl
  const coverName = coverFile?.name ?? (coverImageUrl ? 'Current cover image' : '')
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[min(90vh,760px)] flex-col overflow-hidden sm:max-w-xl"><DialogHeader className="shrink-0"><DialogTitle>{product ? 'Edit product' : 'Create a product'}</DialogTitle><DialogDescription>Configure the product buyers see and the file they receive after checkout.</DialogDescription></DialogHeader><form className="flex min-h-0 flex-1 flex-col gap-5" onSubmit={(event) => void submit(event)}>
    <div className="min-h-0 flex-1 overflow-y-auto p-1"><FieldGroup><Field><FieldLabel htmlFor="shop-product-name">Name</FieldLabel><FieldDescription>Use a clear title and explain what the buyer receives.</FieldDescription><Input id="shop-product-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} placeholder="Product name" /></Field><Field><FieldLabel htmlFor="shop-product-description">Description</FieldLabel><Textarea id="shop-product-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={5000} placeholder="Describe your digital product" /></Field><Field><FieldLabel>Cover image</FieldLabel><FieldDescription>Shown on your public shop and product page. Recommended ratio: 1:1.</FieldDescription>{previewUrl ? <Attachment orientation="vertical" className="w-48"><AttachmentMedia variant="image" className="w-full"><img src={previewUrl} alt="Cover preview" /></AttachmentMedia><AttachmentContent><AttachmentTitle>{coverName}</AttachmentTitle><AttachmentDescription>{coverFile ? displayFileSize(coverFile.size) : 'Current cover image'}</AttachmentDescription></AttachmentContent>{!(busy || uploadingCover) && <AttachmentTrigger asChild><label htmlFor="shop-product-cover" aria-label="Replace cover image"><Input id="shop-product-cover" className="sr-only" type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} /></label></AttachmentTrigger>}<AttachmentActions><AttachmentAction type="button" aria-label={`Remove ${coverName}`} onClick={() => { setCoverFile(null); setCoverImageUrl('') }}><X /></AttachmentAction></AttachmentActions></Attachment> : <ImageFilePicker id="shop-product-cover" accept="image/*" disabled={busy || uploadingCover} onChange={setCoverFile} />}</Field><Field><FieldLabel>Digital download</FieldLabel><FieldDescription>{product ? 'Choose a file to replace the current download. Products with paid orders cannot replace their download.' : 'Upload the file buyers receive. You can publish after it is uploaded.'}</FieldDescription>{downloadFile ? <Attachment className="w-full"><AttachmentMedia><FileText /></AttachmentMedia><AttachmentContent><AttachmentTitle>{downloadFile.name}</AttachmentTitle><AttachmentDescription>{displayFileSize(downloadFile.size)}</AttachmentDescription></AttachmentContent>{!(busy || uploadingCover) && <AttachmentTrigger asChild><label htmlFor="shop-product-download" aria-label="Replace download file"><Input id="shop-product-download" className="sr-only" type="file" onChange={(event) => setDownloadFile(event.target.files?.[0] ?? null)} /></label></AttachmentTrigger>}<AttachmentActions><AttachmentAction type="button" aria-label={`Remove ${downloadFile.name}`} onClick={() => setDownloadFile(null)}><X /></AttachmentAction></AttachmentActions></Attachment> : <FilePicker id="shop-product-download" disabled={busy || uploadingCover} onChange={setDownloadFile} />}</Field><Field><FieldLabel htmlFor="shop-product-price">Amount ({product?.currency ?? currency})</FieldLabel><FieldDescription>Set the one-time amount buyers will pay.</FieldDescription><Input id="shop-product-price" value={price} onChange={(event) => setPrice(event.target.value)} type="number" min={0} step={(product?.currency ?? currency) === 'JPY' ? 1 : 0.01} placeholder={(product?.currency ?? currency) === 'JPY' ? '1000' : '10.00'} /></Field></FieldGroup></div>
    <div className="flex shrink-0 flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy || uploadingCover}>Cancel</Button><Button className="dark-button" type="submit" disabled={busy || uploadingCover}>{busy || uploadingCover ? 'Saving...' : product ? 'Save changes' : 'Save draft'}</Button></div>
  </form></DialogContent></Dialog>
}
