import { useState } from 'react'
import { Check, Copy, Link2, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

function PlatformIcon({ platform }: { platform: 'x' | 'facebook' }) {
  if (platform === 'facebook') return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.6 1.7-1.6h1.8V3.8c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1V10H8v3h2.6v8h2.9Z" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m5.2 4 5.7 6.8L5 20h1.8l4.9-7.4 6.2 7.4H22l-6-7.2L21.5 4h-1.8l-5.2 6.8L8.8 4H5.2Zm2.5 1.4h.8l10.9 13.2h-.8L7.7 5.4Z" /></svg>
}

export function ShareDialog({ url, displayName }: { url: string; displayName: string }) {
  const [copied, setCopied] = useState(false)
  const hasUrl = Boolean(url)

  async function copyLink() {
    if (!hasUrl) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  async function share() {
    if (!hasUrl) return
    if (navigator.share) await navigator.share({ title: `${displayName}'s page`, url })
    else await copyLink()
  }

  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(`Support ${displayName}`)
  const links = [
    { label: 'X', platform: 'x' as const, href: `https://x.com/intent/post?url=${encodedUrl}&text=${encodedText}` },
    { label: 'Facebook', platform: 'facebook' as const, href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
  ]

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" className="share-trigger"><Share2 data-icon="inline-start" /> Share</Button>
      </DialogTrigger>
      <DialogContent className="share-dialog">
        <DialogHeader>
          <DialogTitle>Share your page</DialogTitle>
          <DialogDescription>Earn more by sharing your page regularly.</DialogDescription>
        </DialogHeader>
        <p className="share-tip">Tip: Paste this link anywhere!</p>
        {hasUrl ? <>
          <div className="share-copy-row">
            <span className="share-url">{url}</span>
            <Button type="button" onClick={copyLink}>{copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copied ? 'Copied' : 'Copy'}</Button>
          </div>
          <Button type="button" variant="secondary" className="share-native-button" onClick={share}><Link2 data-icon="inline-start" /> Share link</Button>
        </> : <p className="share-warning">Set your website URL in Settings before sharing.</p>}
        <div className="share-actions" aria-label="Social sharing options">
          {hasUrl && links.map((link) => <a className="share-action" href={link.href} target="_blank" rel="noreferrer" key={link.label} aria-label={`Share on ${link.label}`} title={`Share on ${link.label}`}><PlatformIcon platform={link.platform} /></a>)}
        </div>
      </DialogContent>
    </Dialog>
  )
}
