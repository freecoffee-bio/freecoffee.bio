import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export function ProfileAvatar({ image, name }: { image?: string | null; name: string }) {
  return <Avatar className="profile-avatar" data-avatar-preview>{image ? <img data-slot="avatar-image" className="aspect-square size-full rounded-full object-cover" src={image} alt={`${name} profile photo`} /> : <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>}</Avatar>
}
