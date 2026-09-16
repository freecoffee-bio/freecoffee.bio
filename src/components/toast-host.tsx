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
    document.documentElement.dataset.toastReady = 'true'
    window.dispatchEvent(new CustomEvent('freecoffee:toast-ready'))
    return () => {
      window.removeEventListener('freecoffee:toast', handleToast)
      delete document.documentElement.dataset.toastReady
    }
  }, [])

  return <Toaster position="top-right" richColors closeButton />
}
