import { useState } from 'react'
import { Link2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type SocialLink = { label: string; url: string }

type SocialLinksDialogProps = {

  displayName: string
  bio?: string | null
  website?: string | null
  initialLinks?: string | null
}

function parseLinks(value?: string | null): SocialLink[] {
  if (!value) return []
  try {
    const links = JSON.parse(value)
    return Array.isArray(links) ? links.filter((link): link is SocialLink => Boolean(link?.url)) : []
  } catch {
    return []
  }
}

export function SocialLinksDialog({ displayName, bio, website, initialLinks }: SocialLinksDialogProps) {
  const [open, setOpen] = useState(false)
  const [links, setLinks] = useState<SocialLink[]>(() => parseLinks(initialLinks))
  const [saving, setSaving] = useState(false)

  function addLink() {
    setLinks((current) => [...current, { label: '', url: '' }])
  }

  function updateLink(index: number, field: keyof SocialLink, value: string) {
    setLinks((current) => current.map((link, linkIndex) => linkIndex === index ? { ...link, [field]: value } : link))
  }

  async function saveLinks(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const response = await fetch('/api/admin/creator', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName, bio, website, socialLinks: JSON.stringify(links.filter((link) => link.url.trim())) }),
    })
    setSaving(false)
    if (response.ok) setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" className="social-button">
          <Link2 data-icon="inline-start" />
          {links.length ? 'Your social links...' : 'Add social links'}
        </Button>
      </DialogTrigger>
      <DialogContent className="social-links-dialog">
        <DialogHeader>
          <DialogTitle>Your social links</DialogTitle>
          <DialogDescription>Keep all your links in one place!</DialogDescription>
        </DialogHeader>
        <form className="social-links-form" onSubmit={saveLinks}>
          <div className="social-links-list">
            {links.map((link, index) => (
              <div className="social-link-row" key={`${index}-${link.url}`}>
                <Input value={link.label} onChange={(event) => updateLink(index, 'label', event.target.value)} placeholder="Platform name" aria-label="Platform name" />
                <Input value={link.url} onChange={(event) => updateLink(index, 'url', event.target.value)} type="url" placeholder="https://..." aria-label="Social link URL" required />
                <Button type="button" variant="ghost" size="icon" onClick={() => setLinks((current) => current.filter((_, linkIndex) => linkIndex !== index))} aria-label="Remove link"><Trash2 /></Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" className="add-social-link" onClick={addLink}>
            <Plus data-icon="inline-start" /> {links.length ? 'Add another link' : 'Add your first link'}
          </Button>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
