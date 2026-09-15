import {
  BellRing,
  CircleUserRound,
  Coffee,
  LogOut,
  Menu,
  Moon,
  PanelTop,
  Plus,
  Search,
  SlidersHorizontal,
  Sun,
  Code2,
  Ellipsis,
  Gamepad2,
  Gem,
  HandCoins,
  Home,
  Info,
  Link2,
  Mail,
  ArrowUpRight,
  Activity,
  PlaySquare,
  Radio,
  X,
  Megaphone,
  MessageSquare,
  Receipt,
  Rss,
  Settings,
  Store,
  Users,
  Files,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type IconName =
  | 'home'
  | 'page'
  | 'feed'
  | 'settings'
  | 'payments'
  | 'messages'
  | 'mail'
  | 'supporters'
  | 'memberships'
  | 'shop'
  | 'commissions'
  | 'widgets'
  | 'discord'
  | 'alerts'
  | 'activity'
  | 'promote'
  | 'more'
  | 'coffee'
  | 'logout'
  | 'menu'
  | 'moon'
  | 'sun'
  | 'panel'
  | 'plus'
  | 'search'
  | 'filter'
  | 'info'
  | 'link'
  | 'external'
  | 'twitch'
  | 'x'
  | 'youtube'
  | 'close'
  | 'files';

const icons: Record<IconName, LucideIcon> = {
  home: Home,
  page: CircleUserRound,
  feed: Rss,
  settings: Settings,
  payments: Receipt,
  messages: MessageSquare,
  mail: Mail,
  supporters: Users,
  memberships: Gem,
  shop: Store,
  commissions: HandCoins,
  widgets: Code2,
  discord: Gamepad2,
  alerts: BellRing,
  activity: Activity,
  promote: Megaphone,
  more: Ellipsis,
  coffee: Coffee,
  logout: LogOut,
  menu: Menu,
  moon: Moon,
  sun: Sun,
  panel: PanelTop,
  plus: Plus,
  search: Search,
  filter: SlidersHorizontal,
  info: Info,
  link: Link2,
  external: ArrowUpRight,
  twitch: Radio,
  x: X,
  youtube: PlaySquare,
  close: X,
  files: Files,
};

export function AdminIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const Icon = icons[name];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
