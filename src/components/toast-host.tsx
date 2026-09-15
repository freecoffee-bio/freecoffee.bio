import { useEffect } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import type { ToastType } from '@/lib/toast'

export function ToastHost() {
  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; type?: ToastType }>).detail
      if (!detail?.message) return
      toast[detail.type === 'error' ? 'error' : detail.type === 'success' ? 'success' : 'message'](detail.message)
    }
    window.addEventListener('freecoffee:toast', handleToast)
    return () => window.removeEventListener('freecoffee:toast', handleToast)
  }, [])

  return <Toaster position="top-right" richColors closeButton />
}
