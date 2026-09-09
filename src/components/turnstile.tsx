import { useEffect, useState } from 'react'

declare global { interface Window { turnstile?: { render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void }) => void } } }

export function Turnstile() {
  const [siteKey, setSiteKey] = useState('')
  useEffect(() => {
    let cancelled = false
    fetch('/api/security').then((response) => response.json()).then((value: unknown) => {
      const config = value as { enabled?: boolean; siteKey?: string }
      if (!cancelled && config.enabled && config.siteKey) setSiteKey(config.siteKey)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!siteKey) return
    const browserDocument = window.document
    const mount = browserDocument.querySelector<HTMLElement>('[data-turnstile]')
    const input = browserDocument.querySelector<HTMLInputElement>('[data-turnstile-token]')
    if (!mount || !input) return
    const render = () => window.turnstile?.render(mount, { sitekey: siteKey, callback: (token) => { input.value = token }, 'expired-callback': () => { input.value = '' } })
    if (window.turnstile) render()
    else {
      const script = browserDocument.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.addEventListener('load', render, { once: true })
      browserDocument.head.appendChild(script)
    }
  }, [siteKey])
  return siteKey ? <><input type="hidden" data-turnstile-token /><div data-turnstile /></> : null
}
