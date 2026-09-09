import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select';


export function ShopStatusSelect({ showShop = true }: { showShop?: boolean }) {
  async function change(value: string) {
    const response = await fetch('/api/admin/creator', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ showShop: value === 'open' }) });
    if (!response.ok) window.dispatchEvent(new CustomEvent('freecoffee:toast', { detail: { message: 'Unable to save shop visibility.', type: 'error' } }));
  }
  return <Select defaultValue={showShop ? 'open' : 'closed'} onValueChange={(value) => void change(value)}><SelectTrigger className="shop-status-select"><SelectValue placeholder="Open" /></SelectTrigger><SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)"><SelectGroup><SelectItem value="open">Open</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectGroup></SelectContent></Select>;
}
