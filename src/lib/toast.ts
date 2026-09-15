export type ToastType = 'success' | 'info' | 'warning' | 'error' | 'loading'

export function showToast(message: string, type: ToastType = 'error') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('freecoffee:toast', { detail: { message, type } }))
}
