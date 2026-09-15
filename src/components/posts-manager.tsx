import { useState } from 'react'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { showToast } from '@/lib/toast'

type Post = { id: string; title: string; excerpt?: string | null; body: string; status: string; publishedAt?: string | Date | null }
type ApiResult = { error?: string; post?: Post }

export function PostsManager({ initialPosts }: { initialPosts: Post[] }) {
  const [posts, setPosts] = useState(initialPosts)
  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function createPost(event: { preventDefault: () => void }) {
    event.preventDefault()
    setError('')
    if (!title.trim() || !body.trim()) {
      setError('Title and post content are required.')
      return
    }
    setBusy(true)
    try {
      const response = await fetch('/api/admin/content', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'post', title, excerpt, body }) })
      const result = await response.json().catch(() => ({})) as ApiResult
      if (!response.ok) {
        setError(result.error || 'Unable to create post.')
        showToast(result.error || 'Unable to create post.')
        return
      }
      if (!result.post) {
        setError('The server returned an invalid post.')
        return
      }
      setPosts((current) => [result.post as Post, ...current])
      setTitle('')
      setExcerpt('')
      setBody('')
      showToast('Post saved as draft.', 'success')
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus(post: Post) {
    const status = post.status === 'published' ? 'draft' : 'published'
    const response = await fetch('/api/admin/content', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'post', id: post.id, status }) })
    const result = await response.json().catch(() => ({})) as ApiResult
    if (!response.ok) {
      showToast(result.error || 'Unable to update post.')
      return
    }
    if (!result.post) {
      showToast('The server returned an invalid post.')
      return
    }
    setPosts((current) => current.map((item) => item.id === post.id ? result.post as Post : item))
    showToast(status === 'published' ? 'Post published.' : 'Post moved to drafts.', 'success')
  }

  return <Tabs defaultValue="create" className="w-full gap-0">
    <TabsList className="settings-tabs !h-auto w-full justify-start">
      <TabsTrigger value="create" className="settings-tab h-auto flex-none px-[18px] py-[10px]">Create post</TabsTrigger>
      <TabsTrigger value="list" className="settings-tab h-auto flex-none px-[18px] py-[10px]">Posts list <span className="ml-1 text-xs text-muted-foreground">{posts.length}</span></TabsTrigger>
    </TabsList>
    <TabsContent value="create" className="settings-card">
      <form className="space-y-5" onSubmit={createPost}>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="post-title">Title</FieldLabel>
          <Input id="post-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Share an update" />
        </Field>
        <Field>
          <FieldLabel htmlFor="post-excerpt">Excerpt</FieldLabel>
          <Textarea id="post-excerpt" value={excerpt} onChange={(event) => setExcerpt(event.target.value)} rows={3} placeholder="A short summary for the post list" />
        </Field>
        <Field>
          <FieldLabel htmlFor="post-body">Post content</FieldLabel>
          <Textarea id="post-body" value={body} onChange={(event) => setBody(event.target.value)} rows={9} maxLength={20000} placeholder="Write your update..." />
          <FieldError>{error}</FieldError>
        </Field>
        <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save draft'}</Button>
      </form>
    </TabsContent>
    <TabsContent value="list" className="settings-card space-y-3">
      {posts.length ? posts.map((post) => <article className="flex items-center justify-between gap-4 border-b py-4" key={post.id}><div className="min-w-0"><h2 className="truncate font-semibold">{post.title}</h2><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.excerpt || post.body}</p><span className="mt-2 inline-block text-xs text-muted-foreground">{post.status}</span></div><Button type="button" variant="outline" onClick={() => toggleStatus(post)}>{post.status === 'published' ? 'Unpublish' : 'Publish'}</Button></article>) : <p className="py-8 text-center text-sm text-muted-foreground">No posts yet.</p>}
    </TabsContent>
  </Tabs>
}
