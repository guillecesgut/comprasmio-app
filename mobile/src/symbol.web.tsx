import React from 'react';
import {
  ArrowUp, ArrowUpDown, Baby, BadgeCheck, Banknote, BarChart3, Bell, BellOff, Briefcase, Camera, Calendar, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, Circle, Copy, Download, Eye, File, FileText, Folder,
  Hash, HelpCircle, Heart, History, Home, Image as ImageIcon, Images, Info, LayoutGrid, Landmark, Link as LinkIcon, Lock,
  MapPin, MessageSquare, MessageSquareWarning, MessagesSquare, Mic, MicOff, Minus, Monitor, MoreHorizontal, Music, Package, Palette, Percent,
  Phone, PlusCircle, Plus, QrCode, Radio, Search, Share, ShieldCheck, Shirt, ShoppingBag, ShoppingCart, Sofa, Sparkles, Star, Store, SwitchCamera,
  Timer, Trash2, TrendingUp, TriangleAlert, User, Video, Watch, WifiOff, X, XCircle, type LucideIcon,
} from 'lucide-react';

/**
 * Versión web de `Sym`: los SF Symbols son solo de iOS y en el navegador no se dibujan (quedaban
 * invisibles: estrellas, flechas, cámara…). Mismos nombres que en nativo; los que terminan en
 * `.fill` se pintan rellenos.
 */
export type SymbolName = string;

const ICONS: Record<string, LucideIcon> = {
  'arrow.triangle.2.circlepath.camera': SwitchCamera,
  // Iconos de categorías que define el servidor.
  applewatch: Watch, bag: ShoppingBag, desktopcomputer: Monitor, paintpalette: Palette, sofa: Sofa, sparkles: Sparkles,
  teddybear: Baby, tshirt: Shirt,
  'arrow.up': ArrowUp,
  'arrow.up.arrow.down': ArrowUpDown,
  'bag.fill': ShoppingBag,
  banknote: Banknote, 'banknote.fill': Banknote,
  bell: Bell, 'bell.fill': Bell, 'bell.slash': BellOff,
  briefcase: Briefcase,
  'bubble.left': MessageSquare, 'bubble.left.fill': MessageSquare,
  'bubble.left.and.bubble.right': MessagesSquare, 'bubble.left.and.bubble.right.fill': MessagesSquare,
  'building.columns': Landmark,
  calendar: Calendar, camera: Camera,
  cart: ShoppingCart, 'cart.fill': ShoppingCart,
  'chart.bar': BarChart3, 'chart.bar.fill': BarChart3, 'chart.line.uptrend.xyaxis': TrendingUp,
  checkmark: Check, 'checkmark.circle.fill': CheckCircle2, 'checkmark.seal.fill': BadgeCheck, 'checkmark.shield.fill': ShieldCheck,
  'chevron.backward': ChevronLeft, 'chevron.forward': ChevronRight, 'chevron.down': ChevronDown, 'chevron.up': ChevronUp,
  'chevron.up.chevron.down': ChevronsUpDown,
  circle: Circle,
  'clock.arrow.circlepath': History,
  'doc.fill': File, 'doc.text': FileText, 'doc.text.fill': FileText, 'doc.on.doc': Copy,
  'dot.radiowaves.left.and.right': Radio,
  ellipsis: MoreHorizontal,
  'exclamationmark.bubble': MessageSquareWarning, 'exclamationmark.bubble.fill': MessageSquareWarning,
  'exclamationmark.triangle.fill': TriangleAlert,
  eye: Eye, folder: Folder,
  heart: Heart, 'heart.fill': Heart,
  house: Home, 'house.fill': Home,
  'info.circle': Info, link: LinkIcon, 'lock.fill': Lock,
  magnifyingglass: Search, 'mappin.and.ellipse': MapPin,
  'mic.fill': Mic, 'mic.slash.fill': MicOff,
  minus: Minus, 'music.note': Music, number: Hash, percent: Percent, phone: Phone,
  person: User, 'person.fill': User,
  photo: ImageIcon, 'photo.fill': ImageIcon, 'photo.on.rectangle': Images,
  plus: Plus, 'plus.circle.fill': PlusCircle,
  qrcode: QrCode, 'questionmark.circle.fill': HelpCircle,
  shippingbox: Package, 'shippingbox.fill': Package,
  'square.and.arrow.down': Download, 'square.and.arrow.up': Share,
  'square.grid.2x2': LayoutGrid, 'square.grid.2x2.fill': LayoutGrid,
  star: Star, 'star.fill': Star, storefront: Store, timer: Timer, trash: Trash2,
  'video.fill': Video, 'wifi.slash': WifiOff,
  xmark: X, 'xmark.circle.fill': XCircle,
};

const BOLD = new Set(['semibold', 'bold', 'heavy', 'black']);

export function Sym({ name, size = 20, color = '#1c1c1e', weight = 'regular' }: {
  name: SymbolName; size?: number; color?: string; weight?: string;
}) {
  const Icon = ICONS[name] || Circle;
  const filled = name.endsWith('.fill');
  return (
    <Icon
      size={size}
      color={color}
      fill={filled ? color : 'none'}
      strokeWidth={BOLD.has(weight) ? 2.4 : 2}
      aria-hidden
      style={{ flexShrink: 0 }}
    />
  );
}
