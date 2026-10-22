import type { TextStyle } from 'react-native';

/**
 * Tokens del handoff iOS (design/README.md → Design Tokens).
 * Regla de marca: verde = comprar/confirmar, ámbar = pujar/en vivo.
 * Nunca un botón ámbar y uno verde llenos juntos: un solo CTA lleno por pantalla.
 */
export const C = {
  tint: '#0E7C66',
  tintText: '#0A6350',
  forest: '#0A3B31',
  bid: '#AE5115',
  bidText: '#8E4211',
  bidLight: '#E9A23B',
  mint: '#7FD8B8',
  groupedBg: '#F4F2EE',
  surface: '#FFFFFF',
  fill: '#E6E1D8',
  fill2: '#F2EEE7',
  separator: '#E4DCD0',
  rowSeparator: '#EEE8DF',
  label: '#201F1B',
  secondary: '#6B6455',
  tertiary: '#B0A797',
  unchecked: '#C9C1B5',
  destructive: '#D23B2C',
  grabber: '#D4CCBF',
  label2: '#3D3A34',
  white: '#FFFFFF',
  black: '#000000',
} as const;

/** Estados de pedido (handoff v2 → tabla de estados): texto exacto, fondo / texto. */
export const STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  pendiente_pago: { bg: '#FBE9DC', fg: '#8E4211', label: 'Pendiente de pago' },
  pago_en_revision: { bg: '#E4F0EA', fg: '#0A4A3C', label: 'Pago en revisión' },
  pagado: { bg: '#0E7C66', fg: '#FFFFFF', label: 'Pago confirmado' },
  preparando: { bg: '#EDE8E0', fg: '#4C463C', label: 'Preparando' },
  enviado: { bg: '#EDE8E0', fg: '#4C463C', label: 'Enviado' },
  entregado: { bg: '#0E7C66', fg: '#FFFFFF', label: 'Entregado' },
  en_reclamo: { bg: '#F7DEDA', fg: '#9C2A1E', label: 'En reclamo' },
  cancelado: { bg: '#F2EEE7', fg: '#6B6455', label: 'Cancelado' },
  vencido: { bg: '#F2EEE7', fg: '#6B6455', label: 'Venció el pago' },
};

/** Chips de forma de venta: suave (sobre claro) y sólido (sobre foto/video). */
export const MODE = {
  subasta: { label: 'Subasta', soft: '#FBE9DC', softFg: '#8E4211', solid: '#AE5115', dot: '#AE5115' },
  fijo: { label: 'Precio fijo', soft: '#E4F0EA', softFg: '#0A4A3C', solid: '#0E7C66', dot: '#0E7C66' },
  paquete: { label: 'Paquete', soft: '#FBE9DC', softFg: '#8E4211', solid: '#AE5115', dot: '#AE5115' },
} as const;
export type Mode = keyof typeof MODE;

/** Chips de canal del pedido (E5). */
export const CHANNEL: Record<string, { label: string; bg: string; fg: string }> = {
  catalogo: { label: 'Catálogo', bg: '#F2EEE7', fg: '#4C463C' },
  subasta: { label: 'Subasta', bg: '#FBE9DC', fg: '#8E4211' },
  vivo: { label: 'En vivo', bg: '#FBE9DC', fg: '#8E4211' },
  fijo: { label: 'En vivo', bg: '#FBE9DC', fg: '#8E4211' },
};

/** Tonos suaves de avisos. */
export const SOFT = {
  green: { bg: '#E4F0EA', fg: '#0A4A3C' },
  amber: { bg: '#FBE9DC', fg: '#6E330C' },
  red: { bg: '#F7DEDA', fg: '#9C2A1E' },
  gray: { bg: '#EDE8E0', fg: '#4C463C' },
};

const num: TextStyle = { fontVariant: ['tabular-nums'] };

export const T = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4, color: C.label },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: C.label },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '600', color: C.label },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: C.label },
  body: { fontSize: 17, lineHeight: 22, color: C.label },
  callout: { fontSize: 16, lineHeight: 21, color: C.label },
  subhead: { fontSize: 15, lineHeight: 20, color: C.label },
  footnote: { fontSize: 13, lineHeight: 18, color: C.secondary },
  section: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.4, color: C.secondary, textTransform: 'uppercase' },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  caption2: { fontSize: 10, lineHeight: 13, fontWeight: '600' },
  num,
} satisfies Record<string, TextStyle>;

export const R = {
  card: 22,
  authCard: 26,
  stream: 18,
  featured: 26,
  thumb: 12,
  sheet: 38,
  dock: 34,
  pill: 999,
};

export const shadow = {
  tabBar: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  transmit: { shadowColor: '#AE5115', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  toast: { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
};
