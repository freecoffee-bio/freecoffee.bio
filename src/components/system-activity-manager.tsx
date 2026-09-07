import { useState } from 'react'
import { Webhook } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'

type PaymentEvent = { id: string; provider: string; providerEventId: string; status: string; error: string | null; receivedAt: string | Date }
const pageSize = 10

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return <Pagination className="mt-5"><PaginationContent><PaginationItem><PaginationPrevious href="#" aria-disabled={page === 1} onClick={(event) => { event.preventDefault(); if (page > 1) onChange(page - 1) }} /></PaginationItem>{Array.from({ length: pages }, (_, index) => index + 1).map((value) => <PaginationItem key={value}><PaginationLink href="#" isActive={value === page} onClick={(event) => { event.preventDefault(); onChange(value) }}>{value}</PaginationLink></PaginationItem>)}<PaginationItem><PaginationNext href="#" aria-disabled={page === pages} onClick={(event) => { event.preventDefault(); if (page < pages) onChange(page + 1) }} /></PaginationItem></PaginationContent></Pagination>
}

function date(value: string | Date) {
  return new Date(value).toLocaleString()
}

function statusVariant(status: string) {
  return status === 'received' || status === 'completed' || status === 'active' ? 'default' : status === 'failed' || status === 'expired' ? 'destructive' : 'secondary'
}

export function SystemActivityManager({ paymentEvents }: { paymentEvents: PaymentEvent[] }) {
  const [paymentPage, setPaymentPage] = useState(1)
  const payments = paymentEvents.slice((paymentPage - 1) * pageSize, paymentPage * pageSize)

  return <div className="media-manager"><section className="settings-card mt-0"><div className="connected-heading"><h2>Payment webhook events</h2><p>{paymentEvents.length} events, newest first.</p></div>{paymentEvents.length ? <><Table><TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Status</TableHead><TableHead>Provider</TableHead><TableHead>Received</TableHead><TableHead>Details</TableHead></TableRow></TableHeader><TableBody>{payments.map((event) => <TableRow key={event.id}><TableCell><div className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Webhook aria-hidden="true" /></span><div className="grid min-w-44 gap-0.5"><strong className="font-medium">{event.providerEventId}</strong><span className="text-xs text-muted-foreground">Webhook event</span></div></div></TableCell><TableCell><Badge variant={statusVariant(event.status)}>{event.status}</Badge></TableCell><TableCell className="capitalize text-muted-foreground">{event.provider}</TableCell><TableCell className="text-muted-foreground">{date(event.receivedAt)}</TableCell><TableCell className="max-w-56 whitespace-normal text-muted-foreground">{event.error || 'Received successfully'}</TableCell></TableRow>)}</TableBody></Table><Pager page={paymentPage} total={paymentEvents.length} onChange={setPaymentPage} /></> : <Empty className="min-h-52 border-0"><EmptyMedia><Webhook aria-hidden="true" /></EmptyMedia><EmptyHeader><EmptyTitle>No webhook events</EmptyTitle><EmptyDescription>Payment provider webhook events will appear here.</EmptyDescription></EmptyHeader></Empty>}</section></div>
}
