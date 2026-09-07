import { useMemo, useState } from 'react'
import { ArrowDownLeft, ShoppingBag, UserRound } from 'lucide-react'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Support = { id: string; displayName: string | null; anonymous: boolean; status: string; provider: string | null; providerPaymentId?: string | null; amount: number; currency: string; createdAt: string | Date }
type Order = { id: string; buyerEmail: string; status: string; provider: string | null; providerPaymentId?: string | null; totalAmount: number; currency: string; createdAt: string | Date }
type PaymentItem = { id: string; kind: 'tip' | 'order'; name: string; status: string; provider: string; amount: number; currency: string; createdAt: string | Date; detail: string; providerPaymentId?: string | null }
type PaymentDetails = { items: Array<{ productName: string; quantity: number }>; payments: Array<{ id: string; providerPaymentId: string | null; status: string; amount: number; currency: string; rawReference: string | null }>; events: Array<{ providerEventId: string; status: string; error: string | null }> }
const pageSize = 10

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  return <Pagination className="mt-5"><PaginationContent><PaginationItem><PaginationPrevious href="#" aria-disabled={page === 1} onClick={(event) => { event.preventDefault(); if (page > 1) onChange(page - 1) }} /></PaginationItem>{Array.from({ length: pageCount }, (_, index) => index + 1).map((value) => <PaginationItem key={value}><PaginationLink href="#" isActive={value === page} onClick={(event) => { event.preventDefault(); onChange(value) }}>{value}</PaginationLink></PaginationItem>)}<PaginationItem><PaginationNext href="#" aria-disabled={page === pageCount} onClick={(event) => { event.preventDefault(); if (page < pageCount) onChange(page + 1) }} /></PaginationItem></PaginationContent></Pagination>
}

function formatDate(value: string | Date) { return new Date(value).toLocaleString() }
function formatMoney(amount: number, currency: string) { return `${(amount / (currency === 'JPY' ? 1 : 100)).toFixed(currency === 'JPY' ? 0 : 2)} ${currency}` }
function statusVariant(status: string) { return status === 'completed' || status === 'succeeded' || status === 'paid' ? 'default' : status === 'failed' || status === 'canceled' ? 'destructive' : 'secondary' }

export function PaymentsManager({ supports, orders }: { supports: Support[]; orders: Order[] }) {
  const [type, setType] = useState('all')
  const [page, setPage] = useState(1)
  const items = useMemo<PaymentItem[]>(() => {
    const tips = supports.map((item) => ({ id: item.id, kind: 'tip' as const, name: item.anonymous ? 'Anonymous supporter' : item.displayName || 'Supporter', status: item.status, provider: item.provider || 'pending', providerPaymentId: item.providerPaymentId, amount: item.amount, currency: item.currency, createdAt: item.createdAt, detail: 'Tip' }))
    const shopOrders = orders.map((item) => ({ id: item.id, kind: 'order' as const, name: item.buyerEmail, status: item.status, provider: item.provider || 'pending', amount: item.totalAmount, currency: item.currency, createdAt: item.createdAt, detail: 'Shop order', providerPaymentId: item.providerPaymentId }))
    return (type === 'tips' ? tips : type === 'orders' ? shopOrders : [...tips, ...shopOrders]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [orders, supports, type])
  const visibleItems = items.slice((page - 1) * pageSize, page * pageSize)
  const updateType = (value: string) => { setType(value); setPage(1) }
  const tab = type === 'tips' ? 'received' : type === 'orders' ? 'orders' : 'all'
  return <div className="media-manager"><Tabs value={tab} onValueChange={(value) => updateType(value === 'received' ? 'tips' : value === 'orders' ? 'orders' : 'all')} className="w-full gap-0"><TabsList className="settings-tabs h-auto! w-full justify-start"><TabsTrigger value="all" className="settings-tab h-auto flex-none px-4.5 py-2.5">All</TabsTrigger><TabsTrigger value="received" className="settings-tab h-auto flex-none px-4.5 py-2.5">Received</TabsTrigger><TabsTrigger value="orders" className="settings-tab h-auto flex-none px-4.5 py-2.5">Orders</TabsTrigger></TabsList><TabsContent value={tab}><PaymentList items={visibleItems} total={items.length} page={page} onPageChange={setPage} type={type} onTypeChange={updateType} /></TabsContent></Tabs></div>
}

function PaymentList({ items, total, page, onPageChange, type, onTypeChange }: { items: PaymentItem[]; total: number; page: number; onPageChange: (page: number) => void; type: string; onTypeChange: (type: string) => void }) {
  const [selected, setSelected] = useState<PaymentItem | null>(null)
  const [details, setDetails] = useState<Record<string, PaymentDetails>>({})
  const [loading, setLoading] = useState(false)
  const showDetails = async (item: PaymentItem) => {
    setSelected(item)
    if (details[item.id]) return
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/transactions?${item.kind === 'order' ? 'orderId' : 'supportId'}=${encodeURIComponent(item.id)}`)
      if (!response.ok) return
      const data = await response.json() as Partial<PaymentDetails>
      setDetails((current) => ({ ...current, [item.id]: { items: data.items ?? [], payments: data.payments ?? [], events: data.events ?? [] } }))
    } finally { setLoading(false) }
  }
  const selectedDetails = selected ? details[selected.id] : undefined
  return <><section className="payments-card"><div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-semibold">Activity</h2><p className="text-sm text-muted-foreground">Track tips and shop orders in one place. Open any payment to inspect provider parameters.</p></div><Select value={type} onValueChange={onTypeChange}><SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="All activity" /></SelectTrigger><SelectContent position="popper" align="end" className="w-(--radix-select-trigger-width)"><SelectItem value="all">All activity</SelectItem><SelectItem value="tips">Tips</SelectItem><SelectItem value="orders">Shop orders</SelectItem></SelectContent></Select></div>{total ? <><Table><TableHeader><TableRow><TableHead>Activity</TableHead><TableHead>Status</TableHead><TableHead>Provider</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Details</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={`${item.kind}-${item.id}`}><TableCell><div className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">{item.kind === 'tip' ? <UserRound aria-hidden="true" /> : <ShoppingBag aria-hidden="true" />}</span><div className="grid min-w-44 gap-0.5"><strong className="font-medium">{item.name}</strong><span className="text-xs text-muted-foreground">{item.detail}</span></div></div></TableCell><TableCell><Badge variant={statusVariant(item.status)}>{item.status}</Badge></TableCell><TableCell className="capitalize text-muted-foreground">{item.provider}</TableCell><TableCell className="text-muted-foreground">{formatDate(item.createdAt)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatMoney(item.amount, item.currency)}</TableCell><TableCell className="text-right"><Button type="button" variant="outline" size="sm" onClick={() => void showDetails(item)}>Details</Button></TableCell></TableRow>)}</TableBody></Table><Pager page={page} total={total} onChange={onPageChange} /></> : <div className="payments-empty"><span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><ArrowDownLeft aria-hidden="true" /></span><h2>No payments or orders yet</h2><p>Support and shop activity will appear here.</p></div>}</section><AlertDialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null) }}><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{selected?.kind === 'order' ? 'Order details' : 'Support payment details'}</AlertDialogTitle><AlertDialogDescription>Provider request data saved for this payment.</AlertDialogDescription></AlertDialogHeader>{selected && <div className="grid max-h-[60vh] gap-2 overflow-y-auto text-sm"><span>Reference ID: <code>{selected.id}</code></span><span>Provider payment ID: <code>{selected.providerPaymentId || 'not assigned'}</code></span>{loading && <span className="text-muted-foreground">Loading payment record…</span>}{selectedDetails && <>{selected.kind === 'order' && <span>Items: {selectedDetails.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ') || 'None'}</span>}<span>Payment record: {selectedDetails.payments.map((payment) => `${payment.status} · ${formatMoney(payment.amount, payment.currency)} · ${payment.providerPaymentId || 'no provider ID'}`).join('; ') || 'None'}</span><span>Webhook events: {selectedDetails.events.map((event) => `${event.status} · ${event.providerEventId}${event.error ? ` · ${event.error}` : ''}`).join('; ') || 'No matching webhook event received'}</span><span>Provider request parameters:</span>{selectedDetails.payments.map((payment) => <pre key={payment.id} className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{payment.rawReference || 'not recorded'}</pre>)}</>}</div>}</AlertDialogContent></AlertDialog></>
}
