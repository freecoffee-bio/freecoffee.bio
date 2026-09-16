import { useEffect, useRef, useState } from 'react'

type TurnstileApi = {
  render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string
  remove: (widgetId: string) => void
  reset: (widgetId: string) => void
}

declare global { interface Window { turnstile?: TurnstileApi } }

export function Turnstile() {
  const [siteKey, setSiteKey] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/security').then((response) => response.json()).then((value: unknown) => {
      const config = value as { enabled?: boolean; siteKey?: string }
      if (!cancelled && config.enabled && config.siteKey) setSiteKey(config.siteKey)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!siteKey || !mountRef.current || !inputRef.current) return
    const browserDocument = window.document
    const mount = mountRef.current
    const input = inputRef.current
    let widgetId: string | undefined
    const clearToken = () => { input.value = '' }
    const render = () => {
      if (!window.turnstile || widgetId) return
      widgetId = window.turnstile.render(mount, {
        sitekey: siteKey,
        callback: (token) => { input.value = token },
        'expired-callback': clearToken,
        'error-callback': clearToken,
      })
    }
    const reset = () => {
      clearToken()
      if (widgetId) window.turnstile?.reset(widgetId)
    }
    window.addEventListener('freecoffee:turnstile-reset', reset)
    if (window.turnstile) render()
    else {
      const existingScript = browserDocument.querySelector<HTMLScriptElement>('script[data-freecoffee-turnstile]')
      if (existingScript) existingScript.addEventListener('load', render, { once: true })
      else {
        const script = browserDocument.createElement('script')
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.async = true
        script.defer = true
        script.dataset.freecoffeeTurnstile = 'true'
        script.addEventListener('load', render, { once: true })
        browserDocument.head.appendChild(script)
      }
    }
    return () => {
      window.removeEventListener('freecoffee:turnstile-reset', reset)
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [siteKey])
  return siteKey ? <><input ref={inputRef} type="hidden" data-turnstile-token /><div ref={mountRef} data-turnstile /></> : null
}
