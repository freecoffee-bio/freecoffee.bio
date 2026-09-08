import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Order = { id: string; buyerEmail: string; status: string; provider: string | null; providerPaymentId: string | null; totalAmount: number; currency: string; createdAt: string | Date }
type Details = { items: Array<{ productName: string; quantity: number }>; payments: Array<{ providerPaymentId: string | null; status: string; amount: number; currency: string; rawReference: string | null }>; events: Array<{ providerEventId: string; status: string; error: string | null }> }

function money(amount: number, currency: string) { return `${(amount / (currency === 'JPY' ? 1 : 100)).toFixed(currency === 'JPY' ? 0 : 2)} ${currency}` }
function variant(status: string) { return status === 'paid' ? 'default' : status === 'failed' || status === 'expired' ? 'destructive' : 'secondary' }

export function ShopOrdersManager({ orders }: { orders: Order[] }) {
  const [selected, setSelected] = useState<Order | null>(null)
  const [details, setDetails] = useState<Record<string, Details>>({})
  const [loading, setLoading] = useState(false)

  async function showDetails(order: Order) {
    setSelected(order)
    if (details[order.id]) return
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/transactions?orderId=${encodeURIComponent(order.id)}`)
      if (!response.ok) return
      const data = await response.json() as Partial<Details>
      setDetails((current) => ({ ...current, [order.id]: { items: data.items ?? [], payments: data.payments ?? [], events: data.events ?? [] } }))
    } finally {
      setLoading(false)
    }
  }

  const selectedDetails = selected ? details[selected.id] : undefined
  return <><Table className="min-w-180"><TableHeader><TableRow><TableHead>Buyer</TableHead><TableHead>Status</TableHead><TableHead>Provider</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{orders.map((order) => <TableRow key={order.id}><TableCell><div className="grid gap-0.5"><strong className="font-medium">{order.buyerEmail}</strong><span className="text-xs text-muted-foreground">Order {order.id.slice(0, 8)}</span></div></TableCell><TableCell><Badge variant={variant(order.status)}>{order.status}</Badge></TableCell><TableCell className="capitalize text-muted-foreground">{order.provider || 'pending'}</TableCell><TableCell className="text-muted-foreground">{new Date(order.createdAt).toLocaleString()}</TableCell><TableCell className="text-right font-semibold tabular-nums">{money(order.totalAmount, order.currency)}</TableCell><TableCell className="text-right"><Button type="button" variant="outline" size="sm" onClick={() => void showDetails(order)}>Details</Button></TableCell></TableRow>)}</TableBody></Table><Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null) }}><DialogContent className="flex max-h-[min(90vh,760px)] flex-col overflow-hidden sm:max-w-xl"><DialogHeader className="shrink-0"><DialogTitle>Order details</DialogTitle><DialogDescription>Provider request data saved for this order.</DialogDescription></DialogHeader>{selected && <div className="grid min-h-0 gap-3 overflow-y-auto text-sm"><div><span className="font-medium">Order ID</span><code className="mt-1 block break-all rounded-md bg-muted px-3 py-2 text-xs">{selected.id}</code></div><div><span className="font-medium">Provider payment ID</span><code className="mt-1 block break-all rounded-md bg-muted px-3 py-2 text-xs">{selected.providerPaymentId || 'not assigned'}</code></div>{loading && <span className="text-muted-foreground">Loading order details...</span>}{selectedDetails && <><div><span className="font-medium">Items</span><p className="mt-1 text-muted-foreground">{selectedDetails.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ') || 'None'}</p></div><div><span className="font-medium">Payment record</span><p className="mt-1 text-muted-foreground">{selectedDetails.payments.map((payment) => `${payment.status} · ${money(payment.amount, payment.currency)} · ${payment.providerPaymentId || 'no provider ID'}`).join('; ') || 'None'}</p></div><div><span className="font-medium">Webhook events</span><p className="mt-1 text-muted-foreground">{selectedDetails.events.map((event) => `${event.status} · ${event.providerEventId}${event.error ? ` · ${event.error}` : ''}`).join('; ') || 'No matching webhook event received'}</p></div><div><span className="font-medium">Provider request parameters</span>{selectedDetails.payments.map((payment, index) => <pre key={index} className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">{payment.rawReference || 'not recorded'}</pre>)}</div></>}</div>}</DialogContent></Dialog></>
}
