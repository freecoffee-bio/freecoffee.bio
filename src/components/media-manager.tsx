import { useState } from 'react'
import { Copy, File, Image, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'
import { showToast } from '@/lib/toast'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Storage = { configured: boolean; endpoint: string; region: string; bucket: string; pathPrefix: string; forcePathStyle: boolean; accessKeyConfigured: boolean; secretKeyConfigured: boolean }
type MediaFile = { id: string; originalName: string; mimeType: string; fileSize: number; folder: string | null; publicUrl: string; createdAt: string | Date }
const pageSize = 10

function PageControls({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pageCount = Math.ceil(total / pageSize)
  return <Pagination className="mt-6"><PaginationContent>
    <PaginationItem><PaginationPrevious href="#" aria-disabled={page === 1} onClick={(event) => { event.preventDefault(); if (page > 1) onChange(page - 1) }} /></PaginationItem>
    {Array.from({ length: pageCount }, (_, index) => index + 1).map((value) => <PaginationItem key={value}><PaginationLink href="#" isActive={value === page} onClick={(event) => { event.preventDefault(); onChange(value) }}>{value}</PaginationLink></PaginationItem>)}
    <PaginationItem><PaginationNext href="#" aria-disabled={page === pageCount} onClick={(event) => { event.preventDefault(); if (page < pageCount) onChange(page + 1) }} /></PaginationItem>
  </PaginationContent></Pagination>
}

export function MediaManager({ initialStorage, initialFiles }: { initialStorage: Storage; initialFiles: MediaFile[] }) {
  const [storage, setStorage] = useState(initialStorage)
  const [files, setFiles] = useState(initialFiles)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [endpoint, setEndpoint] = useState(initialStorage.endpoint)
  const [region, setRegion] = useState(initialStorage.region)
  const [bucket, setBucket] = useState(initialStorage.bucket)
  const [pathPrefix, setPathPrefix] = useState(initialStorage.pathPrefix)
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [forcePathStyle, setForcePathStyle] = useState(initialStorage.forcePathStyle)

  const config = () => ({ endpoint, region, bucket, pathPrefix, accessKeyId, secretAccessKey, forcePathStyle })
  const visibleFiles = files.slice((page - 1) * pageSize, page * pageSize)

  async function save(action: 'save' | 'test') {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/media', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...config() }) })
      const result = await response.json().catch(() => ({})) as { error?: string; configured?: boolean; endpoint?: string; region?: string; bucket?: string; pathPrefix?: string; forcePathStyle?: boolean; accessKeyConfigured?: boolean; secretKeyConfigured?: boolean }
      if (!response.ok) { showToast(result.error || 'Unable to update storage settings.'); return }
      if (action === 'test') { showToast('S3 connection test passed.', 'success'); return }
      setStorage(result as Storage)
      setAccessKeyId('')
      setSecretAccessKey('')
      showToast('S3 storage settings saved.', 'success')
    } catch {
      showToast('Unable to reach the storage service. Please try again.')
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!deletingId) return
    setBusy(true)
    const response = await fetch('/api/admin/media', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: deletingId }) })
    const result = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) { showToast(result.error || 'Unable to delete file.'); setBusy(false); return }
    setFiles((current) => current.filter((file) => file.id !== deletingId))
    setPage((current) => Math.min(current, Math.max(1, Math.ceil((files.length - 1) / pageSize))))
    setDeletingId(null)
    setBusy(false)
    showToast('File deleted.', 'success')
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value)
    showToast('URL copied.', 'success')
  }

  return <div className="media-manager">
    <Tabs defaultValue="files" className="w-full gap-0">
      <TabsList className="settings-tabs h-auto! w-full justify-start">
        <TabsTrigger value="files" className="settings-tab h-auto flex-none px-4.5 py-2.5 data-[state=active]:bg-(--admin-panel) data-[state=active]:shadow-[0_1px_3px_oklch(0.25_0_0/0.15)]">Files</TabsTrigger>
        <TabsTrigger value="configuration" className="settings-tab h-auto flex-none px-4.5 py-2.5 data-[state=active]:bg-(--admin-panel) data-[state=active]:shadow-[0_1px_3px_oklch(0.25_0_0/0.15)]">Configuration</TabsTrigger>
      </TabsList>
      <TabsContent value="configuration">
        <section className="settings-card mt-0">
          <div className="connected-heading"><h2>S3 storage</h2><p>Connect Backblaze B2, Cloudflare R2, or any standard S3-compatible service.</p></div>
          <form className="mt-6" onSubmit={(event) => { event.preventDefault(); void save('save') }}>
            <FieldGroup>
              <Field><FieldLabel htmlFor="storage-endpoint">Endpoint</FieldLabel><Input id="storage-endpoint" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://s3.us-west-004.backblazeb2.com" required /></Field>
              <Field><FieldLabel htmlFor="storage-region">Region</FieldLabel><Input id="storage-region" value={region} onChange={(event) => setRegion(event.target.value)} placeholder="us-east-1" required /></Field>
              <Field><FieldLabel htmlFor="storage-bucket">Bucket</FieldLabel><Input id="storage-bucket" value={bucket} onChange={(event) => setBucket(event.target.value)} required /></Field>
              <Field><FieldLabel htmlFor="storage-path-prefix">Path prefix</FieldLabel><Input id="storage-path-prefix" value={pathPrefix} onChange={(event) => setPathPrefix(event.target.value)} placeholder="media" /></Field>
              <Field><FieldLabel htmlFor="storage-access-key">Access key ID</FieldLabel><Input id="storage-access-key" value={accessKeyId} onChange={(event) => setAccessKeyId(event.target.value)} placeholder={storage.accessKeyConfigured ? 'Saved' : 'Required'} /><FieldDescription>{storage.accessKeyConfigured ? 'A key is already saved. Leave this field blank to keep it, or enter a new key ID to replace it.' : 'Enter the access key ID provided by your S3-compatible storage provider.'}</FieldDescription></Field>
              <Field><FieldLabel htmlFor="storage-secret-key">Secret access key</FieldLabel><Input id="storage-secret-key" type="password" value={secretAccessKey} onChange={(event) => setSecretAccessKey(event.target.value)} placeholder={storage.secretKeyConfigured ? 'Saved' : 'Required'} /><FieldDescription>{storage.secretKeyConfigured ? 'A secret is already saved. Leave this field blank to keep it, or enter a new secret key to replace it.' : 'Enter the secret access key provided by your S3-compatible storage provider.'}</FieldDescription></Field>
              <Field orientation="horizontal" className="items-center gap-3 rounded-lg border bg-muted/30 px-3 py-3"><Checkbox id="force-path-style" checked={forcePathStyle} onCheckedChange={(checked) => setForcePathStyle(checked === true)} /><FieldLabel htmlFor="force-path-style" className="font-medium">Use path-style requests</FieldLabel></Field>
              <div className="media-actions"><Button type="submit" disabled={busy}>Save storage</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void save('test')}>Test connection</Button></div>
              <FieldDescription>Credentials are stored in D1 and are never returned to the browser after saving.</FieldDescription>
            </FieldGroup>
          </form>
        </section>
      </TabsContent>
      <TabsContent value="files">
        <section className="settings-card mt-0"><div className="connected-heading"><h2>Files</h2><p>{files.length} files uploaded from creator tools.</p></div>{files.length ? <><div className="media-grid">{visibleFiles.map((file) => <article className="media-row" key={file.id}><div className="media-preview">{file.mimeType.startsWith('image/') ? <img src={file.publicUrl} alt="" /> : <File className="size-6" />}</div><div className="media-copy"><strong title={file.originalName}>{file.originalName}</strong><small>{file.folder || 'root'} · {Math.ceil(file.fileSize / 1024)} KB</small><Input readOnly defaultValue={file.publicUrl} aria-label={`URL for ${file.originalName}`} /></div><div className="media-row-actions"><Button type="button" variant="ghost" size="icon" aria-label="Copy file URL" onClick={() => void copy(new URL(file.publicUrl, window.location.origin).toString())}><Copy className="size-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label="Delete file" onClick={() => setDeletingId(file.id)}><Trash2 className="size-4" /></Button></div></article>)}</div><PageControls page={page} total={files.length} onChange={setPage} /></> : <div className="payments-empty"><Image className="size-8 text-muted-foreground" /><h2>No files yet</h2><p>Images and files uploaded while creating posts or gallery albums will appear here.</p></div>}</section>
      </TabsContent>
    </Tabs>
    <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && !busy && setDeletingId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete file?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the file from object storage.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting...' : 'Delete'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}
