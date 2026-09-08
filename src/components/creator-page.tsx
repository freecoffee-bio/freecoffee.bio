import { useEffect, useState } from 'react'

import { ExternalLink, GitBranch, Globe, Moon, Share2, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AboutSupportPanel, AboutTab, GalleryTab, PostsTab, ShopTab } from '@/components/creator-tabs'
import type { Creator, CurrentUser } from '@/components/creator-tabs'

const tabs = ['About', 'Gallery', 'Posts', 'Shop']

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

export function CreatorPage({ currentUser, creator = { name: 'Creator', handle: 'creator', showSupport: true, showShop: true, products: [] }, isAdmin = false, adminPath = 'admin' }: CreatorPageProps) {
  const [tab, setTab] = useState('About')
  const [darkMode, setDarkMode] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const dark = document.documentElement.classList.contains('dark')
    setDarkMode(dark)
    setTab(tabFromHash(window.location.hash))
    setHydrated(true)

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
    <main className={`w-screen min-h-screen bg-muted/30 ${hydrated ? '' : 'invisible'}`} aria-hidden={!hydrated}>
      <header className="border-b bg-background">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between px-4">
          <a href="/" className="inline-flex" aria-label="FreeCoffee home"><img src="/logo.png" alt="FreeCoffee.bio" className="h-10 w-auto" /></a>
          <nav className="flex items-center gap-3 text-sm text-muted-foreground">
            {currentUser ? <><a className="hover:text-foreground" href="/orders">My orders</a><button className="hover:text-foreground" type="button" onClick={(event) => { const button = event.currentTarget; button.disabled = true; button.textContent = 'Signing out…'; window.location.href = '/api/auth/logout' }}>Sign out</button></> : <a className="hover:text-foreground" href="/login">Sign in</a>}
            <Button asChild size="sm"><a href="https://freecoffee.bio/" target="_blank" rel="noreferrer">Create your page <ExternalLink className="size-4" data-icon="inline-end" /></a></Button>
          </nav>
        </div>
      </header>

      <section className="border-b bg-background">
        <div className="h-40 bg-(--brand-soft) sm:h-52" />
        <div className="mx-auto grid max-w-5xl gap-5 px-4 pb-7 pt-5 sm:grid-cols-[112px_1fr_auto] sm:items-end sm:gap-6 sm:pt-6">
          <div className="-mt-14 grid size-24 place-items-center overflow-hidden rounded-full border-8 border-background bg-primary text-4xl font-semibold text-primary-foreground shadow sm:size-28">{creator.image ? <img src={creator.image} alt="" className="size-full object-cover" /> : creator.name.charAt(0).toUpperCase()}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-tight">{creator.name}</h1><span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">Creator</span></div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">@{creator.handle}</p>
            <p className="mt-3 max-w-2xl text-base text-muted-foreground">{creator.welcomeMessage || creator.bio || 'This creator has not added a bio yet.'}</p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">{creator.website && <a className="inline-flex items-center gap-1 hover:text-foreground" href={creator.website} target="_blank" rel="noreferrer"><Globe className="size-4" /> Website</a>}{creator.socialLinks && <span className="inline-flex items-center gap-1"><GitBranch className="size-4" /> Social links</span>}</div>
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
