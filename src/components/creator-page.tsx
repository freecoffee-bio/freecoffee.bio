import { useEffect, useState } from 'react'

import { ChevronDown, ExternalLink, Globe, LogOut, Moon, Package, ShieldCheck, Share2, Sun, UserRound } from 'lucide-react'
import { SiTwitch, SiX, SiYoutube } from '@icons-pack/react-simple-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AboutSupportPanel, AboutTab, GalleryTab, PostsTab, ShopTab } from '@/components/creator-tabs'
import type { Creator, CurrentUser } from '@/components/creator-tabs'

const tabs = ['About', 'Gallery', 'Posts', 'Shop']

type SocialLink = { label: string; url: string; source: 'social' | 'connected' }

function occupations(value?: string | null) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : []
  } catch {
    return value.trim() ? [value.trim()] : []
  }
}

function socialLinks(value?: string | null): SocialLink[] {
  if (!value) return []
  try {
    const links = JSON.parse(value)
    return Array.isArray(links) ? links.filter((link): link is SocialLink => (link?.source === 'social' || link?.source === 'connected') && typeof link?.label === 'string' && typeof link?.url === 'string' && link.url.trim()) : []
  } catch {
    return []
  }
}

function socialPlatform(link: SocialLink) {
  try {
    const hostname = new URL(/^https?:\/\//i.test(link.url) ? link.url : `https://${link.url}`).hostname.toLowerCase()
    if (hostname === 'x.com' || hostname.endsWith('.x.com') || hostname === 'twitter.com' || hostname.endsWith('.twitter.com')) return { label: 'x.com', Icon: SiX }
    if (hostname === 'twitch.tv' || hostname.endsWith('.twitch.tv')) return { label: 'Twitch', Icon: SiTwitch }
    if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be' || hostname.endsWith('.youtu.be')) return { label: 'YouTube', Icon: SiYoutube }
  } catch {}
  return { label: link.label?.trim() || 'Social link', Icon: ExternalLink }
}

function tabFromHash(hash: string) {
  const value = decodeURIComponent(hash.replace(/^#/, ''))
  return tabs.find((item) => item.toLowerCase() === value) ?? 'About'
}

type CreatorPageProps = {
  currentUser: CurrentUser | null
  creator?: Creator
  isAdmin?: boolean
  adminPath?: string
}

export function CreatorPage({ currentUser, creator = { name: 'Creator', showSupport: true, showShop: true, products: [] }, isAdmin = false, adminPath = 'admin' }: CreatorPageProps) {
  const [tab, setTab] = useState('About')
  const [darkMode, setDarkMode] = useState(false)
  const links = socialLinks(creator.socialLinks)
  const creatorOccupations = occupations(creator.whatDo)

  useEffect(() => {
    const dark = document.documentElement.classList.contains('dark')
    setDarkMode(dark)
    setTab(tabFromHash(window.location.hash))

    function syncTab() {
      setTab(tabFromHash(window.location.hash))
    }

    window.addEventListener('hashchange', syncTab)
    return () => window.removeEventListener('hashchange', syncTab)
  }, [])

  function selectTab(value: string) {
    setTab(value)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${value.toLowerCase()}`)
  }

  function toggleTheme() {
    const dark = !darkMode
    document.documentElement.classList.toggle('dark', dark)
    setDarkMode(dark)
    try {
      localStorage.setItem('freecoffee-theme', dark ? 'dark' : 'light')
    } catch {}
  }

  return (
    <main className="min-h-screen w-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between px-4">
          <a href="/" className="inline-flex" aria-label="FreeCoffee home"><img src="/logo.png" alt="FreeCoffee.bio" className="h-10 w-auto" /></a>
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            {currentUser ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="gap-1 px-1" aria-label="Open account menu"><Avatar size="sm" className="size-5"><AvatarImage src={currentUser.image ?? undefined} alt="" /><AvatarFallback className="text-[10px]">{(currentUser.name || currentUser.email).charAt(0).toUpperCase()}</AvatarFallback></Avatar><span className="max-w-28 truncate">{currentUser.name || currentUser.email}</span><ChevronDown data-icon="inline-end" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuLabel className="flex flex-col gap-0.5"><span className="truncate text-foreground">{currentUser.name || currentUser.email}</span><span className="truncate font-normal">{currentUser.email}</span></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem asChild><a href="/profile"><UserRound />Account profile</a></DropdownMenuItem><DropdownMenuItem asChild><a href="/orders"><Package />My orders</a></DropdownMenuItem><DropdownMenuItem asChild><a href="/account"><ShieldCheck />Account security</a></DropdownMenuItem></DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => { window.location.href = '/api/auth/logout' }}><LogOut />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : <a className="hover:text-foreground" href="/login">Sign in</a>}
            <Button asChild size="sm"><a href="https://freecoffee.bio/" target="_blank" rel="noreferrer">Create your page <ExternalLink data-icon="inline-end" /></a></Button>
          </nav>
        </div>
      </header>

      <section className="border-b bg-background">
        <div className="h-40 bg-(--brand-soft) sm:h-52" />
        <div className="mx-auto grid max-w-5xl gap-5 px-4 pb-7 pt-5 sm:grid-cols-[112px_1fr_auto] sm:items-end sm:gap-6 sm:pt-6">
          <Avatar className="-mt-14 size-24 border-8 border-background bg-primary text-4xl font-semibold text-primary-foreground shadow sm:size-28"><AvatarImage src={creator.image ?? undefined} alt={`${creator.name} profile photo`} /><AvatarFallback className="bg-primary text-4xl font-semibold text-primary-foreground">{creator.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-tight">{creator.name}</h1><span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">Creator</span></div>

            <div className="mt-3 flex flex-wrap gap-2">{creatorOccupations.length ? creatorOccupations.map((occupation) => <span className="rounded-full bg-muted/60 px-2.5 py-1 text-xs font-semibold text-muted-foreground" key={occupation}>{occupation}</span>) : <span className="text-base text-muted-foreground">This creator has not added a role yet.</span>}</div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">{creator.website && <a className="inline-flex items-center gap-1 hover:text-foreground" href={creator.website} target="_blank" rel="noreferrer"><Globe className="size-4" /> Website</a>}{links.filter((link) => link.source !== 'connected').map((link, index) => { let hostname = link.url; try { hostname = new URL(/^https?:\/\//i.test(link.url) ? link.url : `https://${link.url}`).hostname.replace(/^www\./i, '') } catch {} return <a className="inline-flex items-center gap-1 hover:text-foreground" href={/^https?:\/\//i.test(link.url) ? link.url : `https://${link.url}`} target="_blank" rel="noreferrer" key={`${link.url}-${index}`}><ExternalLink className="size-4" aria-hidden="true" /> {hostname}</a> })}{links.filter((link) => link.source === 'connected').map((link, index) => { const platform = socialPlatform(link); return <a className="inline-flex items-center gap-1 hover:text-foreground" href={/^https?:\/\//i.test(link.url) ? link.url : `https://${link.url}`} target="_blank" rel="noreferrer" key={`${link.url}-${index}`}><span className="grid size-4 shrink-0 place-items-center"><platform.Icon className={platform.label === 'x.com' ? 'size-3.5' : 'size-4'} aria-hidden="true" /></span> {platform.label}</a> })}</div>
          </div>
          <div className="flex gap-2"><Button variant="outline" size="icon" aria-label="Share creator page"><Share2 className="size-4" /></Button>{isAdmin && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More options">•••</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><a href={`/${adminPath}/settings`}>Edit page</a></DropdownMenuItem><DropdownMenuItem asChild><a href={`/${adminPath}/settings?tab=page`}>Edit goal</a></DropdownMenuItem></DropdownMenuContent></DropdownMenu>}<Button variant="outline" size="icon" type="button" onClick={toggleTheme} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>{darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button></div>
        </div>
        <div className="mx-auto flex max-w-5xl gap-6 overflow-x-auto px-4" role="tablist" aria-label="Creator page sections">{tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => selectTab(item)} className={`min-h-11 shrink-0 border-b-2 px-1 text-sm ${tab === item ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground'}`}>{item}{item === 'Posts' && <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{creator.posts?.length ?? 0}</span>}</button>)}</div>
      </section>

      <div className={`mx-auto grid max-w-5xl gap-5 px-4 py-6 ${tab === 'About' ? 'lg:grid-cols-[1.08fr_.92fr] lg:items-start' : ''}`}>
        <div className="min-h-[520px] space-y-5">
          {tab === 'About' && <AboutTab creator={creator} currentUser={currentUser} isAdmin={isAdmin} />}
          {tab === 'Gallery' && <GalleryTab creator={creator} currentUser={currentUser} isAdmin={isAdmin} />}
          {tab === 'Posts' && <PostsTab creator={creator} currentUser={currentUser} isAdmin={isAdmin} />}
          {tab === 'Shop' && <ShopTab creator={creator} currentUser={currentUser} isAdmin={isAdmin} />}
        </div>
        {tab === 'About' && <AboutSupportPanel creator={creator} currentUser={currentUser} isAdmin={isAdmin} />}
      </div>

      <footer className="border-t bg-background"><div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-3 px-4 py-5 font-mono text-[14px] text-muted-foreground"><span>FreeCoffee<span className="text-primary">.bio</span></span><span>Creator-owned support, made simple.</span><a href="/privacy">Privacy</a></div></footer>
    </main>
  )
}
