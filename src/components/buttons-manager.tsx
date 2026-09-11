import { useEffect, useState, type ComponentType } from 'react'
import QRCode from 'qrcode'
import { Check, Code2, Copy, Gamepad2, Gift, Image, MessageSquare, Package, QrCode, Radio, Sparkles } from 'lucide-react'
import { SiGithub, SiYoutube } from '@icons-pack/react-simple-icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { showToast } from '@/lib/toast'

type Platform = 'button' | 'github' | 'youtube'
type Integration = { platform: Platform; enabled: boolean; buttonText: string; theme: string; color: string; textColor: string; buttonType: string }
type Props = { siteUrl: string; handle: string; initial: Integration[] }
type Tool = { key: string; title: string; description: string; Icon: ComponentType<any>; platform?: Platform; available: boolean }

const tools: Tool[] = [
  { key: 'button', title: 'FreeCoffee button', description: 'Add a FreeCoffee button anywhere that accepts HTML.', Icon: Gift, platform: 'button', available: true },
  { key: 'discord', title: 'Discord', description: 'Offer Discord roles to your supporters with automatic invites and role assignment.', Icon: Gamepad2, available: false },
  { key: 'stream-alerts', title: 'Stream alerts', description: 'Show payment alerts on your live stream and encourage more support.', Icon: Radio, available: false },
  { key: 'twitch-chat', title: 'Twitch chat alerts', description: 'Add FreeCoffee payment alerts to your Twitch chat.', Icon: Radio, available: false },
  { key: 'youtube-chat', title: 'YouTube chat alerts', description: 'Add FreeCoffee payment alerts to your YouTube chat.', Icon: SiYoutube, available: false },
  { key: 'github', title: 'GitHub tip button', description: 'Add a FreeCoffee button to GitHub or anywhere that uses Markdown.', Icon: SiGithub, platform: 'github', available: true },
  { key: 'youtube', title: 'YouTube support button', description: 'Add a FreeCoffee button to your channel description or website.', Icon: SiYoutube, platform: 'youtube', available: true },
  { key: 'qr', title: 'QR code', description: 'Share your page instantly with a QR code.', Icon: QrCode, available: true },
]

export function ButtonsManager({ siteUrl, handle, initial }: Props) {
  const [items, setItems] = useState(initial)
  const [selected, setSelected] = useState<Platform | 'qr' | null>(null)
  const [buttonType, setButtonType] = useState<'button' | 'image'>('button')
  const [buttonText, setButtonText] = useState(initial.find((item) => item.platform === 'button')?.buttonText || 'Support me on FreeCoffee')
  const [qrImage, setQrImage] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const pageUrl = `${siteUrl.replace(/\/$/, '')}/`
  const buttonUrl = (platform: Platform) => `${siteUrl.replace(/\/$/, '')}/api/buttons/${platform}.svg?creator=${encodeURIComponent(handle)}`
  const selectedItem = selected && selected !== 'qr' ? items.find((item) => item.platform === selected) : null
  const button = items.find((item) => item.platform === 'button')
  const markdown = (item: Integration) => `[![${item.buttonText.replace(/[\[\]]/g, '')}](${buttonUrl(item.platform)})](${pageUrl})`
  const html = (item: Integration) => `<a href="${safePageUrl}"><img src="${escapeHtml(buttonUrl(item.platform))}" alt="${escapeHtml(item.buttonText)}"></a>`
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] as string)
  const safePageUrl = escapeHtml(pageUrl)
  const safeButtonText = escapeHtml(buttonText)
  const buttonCode = button ? buttonType === 'image' ? html({ ...button, buttonText, platform: 'button' }) : `<a href="${safePageUrl}" style="display:inline-flex;align-items:center;padding:10px 18px;border-radius:8px;background:${button.color};color:${button.textColor};font:700 14px Arial;text-decoration:none">${safeButtonText}</a>` : ''

  useEffect(() => {
    if (selected === 'button') {
      setButtonType(button?.buttonType === 'image' ? 'image' : 'button')
      setButtonText(button?.buttonText || 'Support me on FreeCoffee')
    }
    if (selected === 'qr') void QRCode.toDataURL(pageUrl, { margin: 2, width: 420 }).then(setQrImage).catch(() => showToast('Unable to create QR code.'))
  }, [pageUrl, selected])

  async function save(item: Integration) {
    setSaving(item.platform)
    try {
      const response = await fetch('/api/admin/integrations/buttons', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(item) })
      const result = await response.json().catch(() => ({})) as { integrations?: Integration[]; error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save button settings.')
      if (result.integrations) setItems(result.integrations)
      showToast('Button settings saved.', 'success'); setSelected(null)
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to save button settings.') } finally { setSaving(null) }
  }

  async function copy(value: string) { try { await navigator.clipboard.writeText(value); showToast('Code copied.', 'success') } catch { showToast('Unable to copy code.') } }
  function updateButton(values: Partial<Integration>) { setItems((current) => current.map((item) => item.platform === 'button' ? { ...item, ...values } : item)) }
  function selectButtonType(type: 'button' | 'image') { setButtonType(type); updateButton({ buttonType: type }) }

  return <div className="admin-tools-page">
    <div className="admin-heading"><p className="admin-kicker">Creator tools</p><h1>Buttons, widgets & shareables</h1><p>Use these tools and integrations to grow your support.</p></div>
    <section className="tool-list" aria-label="Creator tools">{tools.map((tool) => <button type="button" className={`tool-row ${tool.available ? '' : 'tool-row-disabled'}`} key={tool.key} onClick={() => tool.available && setSelected(tool.platform || 'qr')} disabled={!tool.available}><span className={`tool-icon tool-icon-${tool.key}`}><tool.Icon aria-hidden="true" /></span><span className="tool-copy"><strong>{tool.title}</strong><small>{tool.description}</small></span>{!tool.available && <span className="tool-status">Coming soon</span>}</button>)}</section>
    <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
      <DialogContent className={selected === 'qr' ? 'qr-dialog' : 'button-dialog'}>
        {selected === 'qr' ? <><DialogHeader><DialogTitle>Your QR code</DialogTitle><DialogDescription>Download it and share your page anywhere.</DialogDescription></DialogHeader><div className="qr-content"><p>Link to: {pageUrl}</p>{qrImage && <img src={qrImage} alt={`QR code linking to ${pageUrl}`} />}</div><DialogFooter><Button type="button" variant="secondary" onClick={() => setSelected(null)}>Close</Button>{qrImage && <Button asChild className="primary-button qr-download-button"><a href={qrImage} download="freecoffee-page-qr.png">Download</a></Button>}</DialogFooter></> : <><DialogHeader><DialogTitle>{selected === 'button' ? 'Create your button' : selected === 'github' ? 'Markdown tip button' : 'YouTube support button'}</DialogTitle><DialogDescription>{selected === 'button' ? 'Customize your support button and copy the code into your page.' : 'Customize your button and copy the code into your page or profile.'}</DialogDescription></DialogHeader>{selected === 'button' && button ? <FieldGroup><div className="button-type-tabs"><button type="button" className={buttonType === 'button' ? 'is-active' : ''} onClick={() => selectButtonType('button')}>Button</button><button type="button" className={buttonType === 'image' ? 'is-active' : ''} onClick={() => selectButtonType('image')}>Image</button></div><div className="button-preview" style={{ background: '#6f6f6f' }}>{buttonType === 'image' ? <img src={buttonUrl('button')} alt={buttonText} /> : <a href={pageUrl} className="custom-button-preview" style={{ background: button.color, color: button.textColor }}>{buttonText}</a>}</div><Field><FieldLabel htmlFor="button-text">Button text & color</FieldLabel><div className="button-settings-grid"><Input id="button-text" value={buttonText} maxLength={80} onChange={(event) => { setButtonText(event.currentTarget.value); updateButton({ buttonText: event.currentTarget.value }) }} /><label className="color-control"><span>Background</span><Input aria-label="Button background color" type="color" value={button.color} onChange={(event) => updateButton({ color: event.target.value })} /></label><label className="color-control"><span>Text</span><Input aria-label="Button text color" type="color" value={button.textColor} onChange={(event) => updateButton({ textColor: event.target.value })} /></label></div><FieldDescription>Choose the text and color shown on your support button.</FieldDescription></Field><Field><FieldLabel htmlFor="button-code">Copy and paste code</FieldLabel><div className="flex gap-2"><Input id="button-code" readOnly value={buttonCode} /><Button type="button" variant="outline" size="icon" onClick={() => void copy(buttonCode)} aria-label="Copy button code"><Copy /></Button></div></Field></FieldGroup> : selectedItem && <FieldGroup><div className={`button-preview ${selectedItem.theme === 'dark' ? 'button-preview-dark' : ''}`}><a href={pageUrl} target="_blank" rel="noreferrer"><img src={buttonUrl(selectedItem.platform)} alt={selectedItem.buttonText} /></a></div><Field><FieldLabel htmlFor="external-button-text">Button text</FieldLabel><Input id="external-button-text" value={selectedItem.buttonText} maxLength={80} onChange={(event) => setItems((current) => current.map((entry) => entry.platform === selectedItem.platform ? { ...entry, buttonText: event.target.value } : entry))} /></Field><Field><FieldLabel htmlFor="external-button-theme">Button theme</FieldLabel><NativeSelect id="external-button-theme" value={selectedItem.theme} onChange={(event) => setItems((current) => current.map((entry) => entry.platform === selectedItem.platform ? { ...entry, theme: event.target.value } : entry))}><NativeSelectOption value="light">Light</NativeSelectOption><NativeSelectOption value="dark">Dark</NativeSelectOption></NativeSelect></Field><Field><FieldLabel htmlFor="external-markdown">Markdown</FieldLabel><div className="flex gap-2"><Input id="external-markdown" readOnly value={markdown(selectedItem)} /><Button type="button" variant="outline" size="icon" onClick={() => void copy(markdown(selectedItem))} aria-label="Copy Markdown"><Copy /></Button></div></Field><Field><FieldLabel htmlFor="external-html">HTML</FieldLabel><div className="flex gap-2"><Input id="external-html" readOnly value={html(selectedItem)} /><Button type="button" variant="outline" size="icon" onClick={() => void copy(html(selectedItem))} aria-label="Copy HTML"><Code2 /></Button></div></Field></FieldGroup>}<DialogFooter><Button type="button" variant="secondary" onClick={() => setSelected(null)}>Close</Button>{selected === 'button' && button ? <Button type="button" onClick={() => void save({ ...button, buttonText, platform: 'button' })} disabled={saving === 'button'}>{saving === 'button' ? 'Saving...' : <><Check data-icon="inline-start" />Save button</>}</Button> : selectedItem && <Button type="button" onClick={() => void save(selectedItem)} disabled={saving === selectedItem.platform}>{saving === selectedItem.platform ? 'Saving...' : <><Check data-icon="inline-start" />Save button</>}</Button>}</DialogFooter></>}
      </DialogContent>
    </Dialog>
  </div>
}
