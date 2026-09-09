import { useMemo, useState } from 'react'
import { SiTwitch, SiX, SiYoutube } from '@icons-pack/react-simple-icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { showToast } from '@/lib/toast'

type AccountKey = 'x.com' | 'Twitch' | 'YouTube'
type SocialLink = { label: string; url: string; source: 'social' | 'connected' }
type Account = { key: AccountKey; Icon: typeof SiX; placeholder: string; matches: (url: string) => boolean }

function hostMatches(url: string, hosts: string[]) {
  try {
    const hostname = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase()
    return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

const accounts: Account[] = [
  { key: 'x.com', Icon: SiX, placeholder: 'https://x.com/your-name', matches: (url) => hostMatches(url, ['x.com', 'twitter.com']) },
  { key: 'Twitch', Icon: SiTwitch, placeholder: 'https://twitch.tv/your-name', matches: (url) => hostMatches(url, ['twitch.tv']) },
  { key: 'YouTube', Icon: SiYoutube, placeholder: 'https://youtube.com/@your-name', matches: (url) => hostMatches(url, ['youtube.com', 'youtu.be']) },
]

function parseLinks(value?: string | null): SocialLink[] {
  if (!value) return []
  try {
    const links = JSON.parse(value)
    return Array.isArray(links) ? links.filter((link): link is SocialLink => (link?.source === 'social' || link?.source === 'connected') && typeof link?.url === 'string' && link.url.trim() && typeof link?.label === 'string') : []
  } catch {
    return []
  }
}


export function ConnectedAccounts({ displayName, bio, website, initialLinks }: { displayName: string; bio?: string | null; website?: string | null; initialLinks?: string | null }) {
  const [links, setLinks] = useState(() => parseLinks(initialLinks))
  const [editing, setEditing] = useState<AccountKey | null>(null)
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const linksByAccount = useMemo(() => new Map(accounts.map((account) => [account.key, links.find((link) => link.source === 'connected' && account.matches(link.url))])), [links])
  const account = accounts.find((item) => item.key === editing)

  function openEditor(next: Account) {
    setEditing(next.key)
    setUrl(linksByAccount.get(next.key)?.url ?? '')
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account || !url.trim()) return
    let normalizedUrl = url.trim()
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`
    try {
      new URL(normalizedUrl)
    } catch {
      showToast('Enter a valid platform URL.')
      return
    }

    setSaving(true)
    const current = linksByAccount.get(account.key)
    const nextLinks = current
      ? links.map((link) => link === current ? { ...link, label: account.key, url: normalizedUrl } : link)
      : [...links, { label: account.key, url: normalizedUrl, source: 'connected' as const }]
    try {
      const response = await fetch('/api/admin/creator', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName, bio, website, socialLinks: JSON.stringify(nextLinks) }),
      })
      if (!response.ok) throw new Error('Unable to save connected account.')
      setLinks(nextLinks)
      setEditing(null)
      showToast(`${account.key} link saved.`, 'success')
      window.location.reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save connected account.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <div className="connected-accounts-list">
      {accounts.map((item) => {
        const link = linksByAccount.get(item.key)
        return <div className="connected-row" key={item.key}><span className="connected-account"><item.Icon className="size-4" aria-hidden="true" /> <span>{link ? <a href={link.url} target="_blank" rel="noreferrer">{link.url}</a> : item.key}</span></span><Button type="button" variant="outline" onClick={() => openEditor(item)}>{link ? 'Edit' : 'Add URL'}</Button></div>
      })}
    </div>
    <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{account ? `${account.key} URL` : 'Connected account'}</DialogTitle><DialogDescription>Add the public profile URL for this platform.</DialogDescription></DialogHeader>
        <form className="social-links-form" onSubmit={save}>
          <Input value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder={account?.placeholder} aria-label={`${account?.key ?? 'Platform'} URL`} required />
          <DialogFooter><Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save URL'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>
}
