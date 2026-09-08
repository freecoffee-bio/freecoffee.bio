import { useState } from 'react'
import { CheckCircle2, Mail, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'
import { showToast } from '@/lib/toast'

type Template = { id: string; eventKey: string; displayName: string; description: string; subject: string; bodyText: string; bodyHtml: string | null; enabled: boolean }
type Delivery = { id: string; channel: string; recipient: string; template: string; referenceId: string | null; status: string; attempts: number; lastError: string | null; createdAt: string | Date }
const pageSize = 10

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return <Pagination className="mt-5"><PaginationContent><PaginationItem><PaginationPrevious href="#" aria-disabled={page === 1} onClick={(event) => { event.preventDefault(); if (page > 1) onChange(page - 1) }} /></PaginationItem>{Array.from({ length: pages }, (_, i) => i + 1).map((value) => <PaginationItem key={value}><PaginationLink href="#" isActive={value === page} onClick={(event) => { event.preventDefault(); onChange(value) }}>{value}</PaginationLink></PaginationItem>)}<PaginationItem><PaginationNext href="#" aria-disabled={page === pages} onClick={(event) => { event.preventDefault(); if (page < pages) onChange(page + 1) }} /></PaginationItem></PaginationContent></Pagination>
}

function deliveryVariant(status: string) {
  return status === 'sent' || status === 'delivered' ? 'default' : status === 'failed' ? 'destructive' : 'secondary'
}

function templateNavigationName(template: Template) {
  const names: Record<string, string> = {
    'creator-support-notification': 'New support',
    'order-receipt': 'Order paid',
    'support-receipt': 'Support received',
  }
  return names[template.eventKey] ?? template.displayName
}

export function NotificationsManager({ initialTemplates, initialDeliveries }: { initialTemplates: Template[]; initialDeliveries: Delivery[] }) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [deliveries] = useState(initialDeliveries)
  const [selected, setSelected] = useState(initialTemplates[0]?.id ?? '')
  const [enabled, setEnabled] = useState(initialTemplates[0]?.enabled ?? false)
  const [page, setPage] = useState(1)
  const template = templates.find((item) => item.id === selected) ?? templates[0]
  const visibleDeliveries = deliveries.slice((page - 1) * pageSize, page * pageSize)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!template) return
    const data = new FormData(event.currentTarget)
    const body = { id: template.id, displayName: data.get('displayName'), description: data.get('description'), subject: data.get('subject'), bodyText: data.get('bodyText'), bodyHtml: data.get('bodyHtml'), enabled: data.get('enabled') === 'on' }
    const response = await fetch('/api/admin/notifications', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json().catch(() => ({})) as { error?: string; template?: Template }
    if (!response.ok || !result.template) { showToast(result.error || 'Unable to save template.'); return }
    setTemplates((items) => items.map((item) => item.id === result.template!.id ? result.template! : item))
    showToast('Template saved.', 'success')
  }

  return <div className="media-manager"><Tabs defaultValue="templates" className="w-full gap-0"><TabsList className="settings-tabs h-auto! w-full justify-start"><TabsTrigger value="templates" className="settings-tab h-auto flex-none px-4.5 py-2.5">Templates</TabsTrigger><TabsTrigger value="logs" className="settings-tab h-auto flex-none px-4.5 py-2.5">Delivery logs</TabsTrigger></TabsList><TabsContent value="templates"><section className="settings-card mt-0"><div className="connected-heading"><h2>Message templates</h2><p>Reusable business-event templates. Email is the active channel for now.</p></div>{template && <div className="notifications-template-layout"><nav className="notifications-template-list" aria-label="Message templates">{templates.map((item) => <button type="button" className={item.id === template.id ? 'is-selected' : ''} key={item.id} onClick={() => { setSelected(item.id); setEnabled(item.enabled) }}><strong>{templateNavigationName(item)}</strong><small>{item.eventKey}</small></button>)}</nav><form className="notifications-template-form" key={template.id} onSubmit={save}><FieldGroup><Field><FieldLabel htmlFor="template-display-name">Display name</FieldLabel><Input id="template-display-name" name="displayName" defaultValue={template.displayName} required /></Field><Field><FieldLabel htmlFor="template-description">Description</FieldLabel><Input id="template-description" name="description" defaultValue={template.description} /></Field><Field><FieldLabel htmlFor="template-subject">Subject</FieldLabel><Input id="template-subject" name="subject" defaultValue={template.subject} required /></Field><Field><FieldLabel htmlFor="template-text-body">Text body</FieldLabel><Textarea id="template-text-body" name="bodyText" defaultValue={template.bodyText} rows={8} required /></Field><Field><FieldLabel htmlFor="template-html-body">HTML body</FieldLabel><Textarea id="template-html-body" name="bodyHtml" defaultValue={template.bodyHtml ?? ''} rows={5} /></Field><Field orientation="horizontal" className="items-center gap-3 rounded-lg border bg-muted/30 px-3 py-3"><Checkbox id="template-enabled" checked={enabled} onCheckedChange={(checked) => setEnabled(checked === true)} /><input type="hidden" name="enabled" value={enabled ? 'on' : 'off'} /><FieldLabel htmlFor="template-enabled" className="font-medium">Enable this template</FieldLabel></Field><FieldDescription>Use variables such as <code>{'{{siteName}}'}</code>, <code>{'{{orderId}}'}</code>, <code>{'{{amount}}'}</code>, <code>{'{{currency}}'}</code>, <code>{'{{downloadLinks}}'}</code>, and <code>{'{{supporterName}}'}</code>.</FieldDescription><Button className="w-full sm:w-auto" type="submit">Save template</Button></FieldGroup></form></div>}</section></TabsContent><TabsContent value="logs"><section className="settings-card mt-0"><div className="connected-heading"><h2>Delivery logs</h2><p>{deliveries.length} notification deliveries, newest first.</p></div>{deliveries.length ? <><Table><TableHeader><TableRow><TableHead>Message</TableHead><TableHead>Status</TableHead><TableHead>Recipient</TableHead><TableHead>Attempts</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody>{visibleDeliveries.map((delivery) => <TableRow key={delivery.id}><TableCell><div className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Mail aria-hidden="true" /></span><div className="grid min-w-44 gap-0.5"><strong className="font-medium">{delivery.template}</strong><span className="text-xs text-muted-foreground">{delivery.channel}</span></div></div></TableCell><TableCell><Badge variant={deliveryVariant(delivery.status)}>{delivery.status === 'failed' ? <><XCircle data-icon="inline-start" /> Failed</> : delivery.status === 'sent' ? <><CheckCircle2 data-icon="inline-start" /> Sent</> : delivery.status}</Badge></TableCell><TableCell className="text-muted-foreground">{delivery.recipient}</TableCell><TableCell className="tabular-nums">{delivery.attempts}</TableCell><TableCell className="text-muted-foreground">{new Date(delivery.createdAt).toLocaleString()}</TableCell></TableRow>)}</TableBody></Table><Pager page={page} total={deliveries.length} onChange={setPage} /></> : <div className="payments-empty"><h2>No delivery logs yet</h2><p>Notification delivery attempts will appear here.</p></div>}</section></TabsContent></Tabs></div>
}
