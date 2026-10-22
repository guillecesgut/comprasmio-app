import React from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Animated, Image, TextInput, Switch,
  type ViewStyle, type StyleProp, type TextStyle, type ScrollViewProps, type TextInputProps,
} from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Path, Circle as SvgCircle, Defs, Pattern, Line } from 'react-native-svg';
import { router } from 'expo-router';
import { C, T, R, MODE, STATUS, SOFT, shadow, type Mode } from './theme';
import { bs } from './api';

/* ------------------------------------------------------------- íconos --- */

export type SymbolName = SymbolViewProps['name'];

export function Sym({ name, size = 20, color = C.label, weight = 'regular' }: {
  name: SymbolName; size?: number; color?: string; weight?: SymbolViewProps['weight'];
}) {
  return <SymbolView name={name} size={size} tintColor={color} weight={weight} resizeMode="scaleAspectFit" style={{ width: size, height: size }} />;
}

/* ------------------------------------------------------------- marca --- */

/**
 * Logomark: tile verde con bolsa blanca y punto ámbar. Medidas del APP ICON del
 * Brand Kit (96×96): asa de 24×13 con trazo 4,81, bolsa de 44,4×37, punto de 11,1.
 * Los PNG de assets/ salen de la misma geometría.
 */
export function Logomark({ size = 34 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" accessibilityLabel="ComprasMío!">
      <Rect width={96} height={96} rx={26} fill={C.tint} />
      <Path d="M38.38 36.9V35.975A9.62 9.62 0 0 1 57.62 35.975V36.9" stroke={C.white} strokeWidth={4.81} fill="none" />
      <Path
        d="M31.35 35.05H64.65A5.55 5.55 0 0 1 70.2 40.6V60.95A11.1 11.1 0 0 1 59.1 72.05H36.9A11.1 11.1 0 0 1 25.8 60.95V40.6A5.55 5.55 0 0 1 31.35 35.05Z"
        fill={C.white}
      />
      <SvgCircle cx={48} cy={53.55} r={5.55} fill={C.bidLight} />
    </Svg>
  );
}

export function Wordmark({ size = 21, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <Text style={{ fontFamily: 'PublicSans_700Bold', fontSize: size, letterSpacing: -size * 0.03, color: onDark ? C.white : C.label }}>
      ComprasMío<Text style={{ color: onDark ? C.bidLight : C.bid }}>!</Text>
    </Text>
  );
}

/* ------------------------------------------------------------ botones --- */

/** Feedback de presión del handoff: opacidad .75 y escala .97. */
export function Press({ style, children, disabled, ...rest }: React.ComponentProps<typeof Pressable> & { style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      disabled={disabled}
      {...rest}
      style={({ pressed }) => [style, pressed && !disabled && { opacity: 0.75, transform: [{ scale: 0.98 }] }]}
    >
      {children}
    </Pressable>
  );
}

type Tone = 'tint' | 'bid' | 'tonal' | 'outline' | 'outlineTint' | 'destructive' | 'white' | 'plain';

const TONES: Record<Tone, { bg: string; fg: string; border?: string }> = {
  tint: { bg: C.tint, fg: C.white },
  bid: { bg: C.bid, fg: C.white },
  tonal: { bg: C.fill2, fg: C.label },
  outline: { bg: 'transparent', fg: C.label, border: C.label },
  outlineTint: { bg: 'transparent', fg: C.tintText, border: C.tint },
  destructive: { bg: C.destructive, fg: C.white },
  white: { bg: C.white, fg: C.tintText },
  plain: { bg: 'transparent', fg: C.label },
};

export function Btn({ title, onPress, tone = 'tint', disabled, loading, height = 54, icon, style, textStyle, flex }: {
  title: string; onPress?: () => void; tone?: Tone; disabled?: boolean; loading?: boolean; height?: number;
  icon?: SymbolName; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>; flex?: boolean;
}) {
  const t = TONES[tone];
  return (
    <Press
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={[
        {
          height, borderRadius: R.pill, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center',
          flexDirection: 'row', gap: 8, paddingHorizontal: 20, opacity: disabled ? 0.45 : 1,
          borderWidth: t.border ? 1.5 : 0, borderColor: t.border,
        },
        flex && { flex: 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={t.fg} /> : (
        <>
          {icon && <Sym name={icon} size={height > 44 ? 18 : 15} color={t.fg} weight="semibold" />}
          <Text numberOfLines={1} style={[{ fontSize: height > 44 ? 17 : 15, fontWeight: '600', color: t.fg }, T.num, textStyle]}>{title}</Text>
        </>
      )}
    </Press>
  );
}

/** Botón circular (mínimo táctil 44). */
export function Circle({ icon, onPress, size = 44, bg = C.white, color = C.label, badge, label, children, blur }: {
  icon?: SymbolName; onPress?: () => void; size?: number; bg?: string; color?: string; badge?: number;
  label?: string; children?: React.ReactNode; blur?: boolean;
}) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: blur ? 'transparent' : bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {blur && <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: bg }]} />}
        {children || (icon && <Sym name={icon} size={size * 0.45} color={color} />)}
      </View>
      {!!badge && badge > 0 && <Badge count={badge} style={{ position: 'absolute', top: -2, right: -2 }} />}
    </Press>
  );
}

export function Badge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: C.bid, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.white }, style]}>
      <Text style={[{ color: C.white, fontSize: 11, fontWeight: '700' }, T.num]}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

/* -------------------------------------------------------------- chips --- */

export function Chip({ label, bg, fg, dot, style }: { label: string; bg: string; fg: string; dot?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: bg, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 }, style]}>
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />}
      <Text style={[T.caption1, T.num, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function ModeChip({ mode, solid }: { mode: Mode | string; solid?: boolean }) {
  const m = MODE[mode as Mode] || MODE.subasta;
  return <Chip label={m.label} bg={solid ? m.solid : m.soft} fg={solid ? C.white : m.softFg} />;
}

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const s = STATUS[status] || { bg: C.fill2, fg: C.secondary, label: status };
  return <Chip label={label || s.label} bg={s.bg} fg={s.fg} />;
}

export const thousands = (n: number) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Pill ámbar "● EN VIVO" / "● AL AIRE · 24:08". */
export function LivePill({ label = 'EN VIVO', height = 26 }: { label?: string; height?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.bid, borderRadius: R.pill, paddingHorizontal: 11, height }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.white }} />
      <Text style={[{ color: C.white, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }, T.num]}>{label}</Text>
    </View>
  );
}

export function ViewersPill({ viewers, height = 26 }: { viewers: number; height?: number }) {
  return (
    <View
      accessibilityLabel={`${viewers} espectadores`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,.32)', borderRadius: R.pill, paddingHorizontal: 11, height }}
    >
      <Sym name="eye" size={13} color={C.white} />
      <Text style={[{ color: C.white, fontSize: 12, fontWeight: '600' }, T.num]}>{thousands(viewers)}</Text>
    </View>
  );
}

/* ------------------------------------------------------------ avatar --- */

export function Avatar({ initials, size = 44, bg = C.forest, fg = C.white, ring }: {
  initials: string; size?: number; bg?: string; fg?: string; ring?: string;
}) {
  const inner = (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
  if (!ring) return inner;
  // Anillo del handoff: 2.5 blanco + 2 de color.
  return (
    <View style={{ padding: 2.5, borderRadius: size, borderWidth: 2, borderColor: ring, backgroundColor: C.white }}>{inner}</View>
  );
}

/* ----------------------------------------------- placeholder de imagen --- */

/**
 * Los productos todavía no tienen foto: se muestra el color del producto a
 * rayas, como en el handoff. Cuando haya fotos, reemplazar por <Image>.
 */
export function Placeholder({ color = C.tint, style, radius = R.thumb, strong, children }: {
  color?: string; style?: StyleProp<ViewStyle>; radius?: number; strong?: boolean; children?: React.ReactNode;
}) {
  const id = React.useId().replace(/:/g, '');
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: strong ? color : C.white }, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <Pattern id={id} width={22} height={22} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <Rect width={22} height={22} fill={color} opacity={strong ? 1 : 0.16} />
            <Line x1={0} y1={0} x2={0} y2={22} stroke={strong ? '#000' : color} strokeWidth={16} opacity={strong ? 0.12 : 0.1} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}

/* --------------------------------------------------- listas agrupadas --- */

export function SectionHeader({ title, color, right, style }: { title: string; color?: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 32, paddingTop: 24, paddingBottom: 8 }, style]}>
      <Text style={[T.section, color ? { color } : null]}>{title}</Text>
      {right}
    </View>
  );
}

/** Tarjeta blanca radio 22 con separadores hairline entre hijos. */
export function Group({ children, style, radius = R.card, inset = 0 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number; inset?: number }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ backgroundColor: C.surface, borderRadius: radius, marginHorizontal: 16, overflow: 'hidden' }, style]}>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.rowSeparator, marginLeft: inset }} />}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

export function Row({ icon, iconColor = C.tint, left, title, subtitle, right, onPress, chevron, destructive, minHeight = 52 }: {
  icon?: SymbolName; iconColor?: string; left?: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode;
  right?: React.ReactNode; onPress?: () => void; chevron?: boolean; destructive?: boolean; minHeight?: number;
}) {
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight }}>
      {icon && <Sym name={icon} size={22} color={destructive ? C.destructive : iconColor} />}
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string'
          ? <Text numberOfLines={1} style={[T.body, destructive && { color: C.destructive }]}>{title}</Text>
          : title}
        {typeof subtitle === 'string' ? <Text numberOfLines={2} style={[T.footnote, { marginTop: 2 }]}>{subtitle}</Text> : subtitle}
      </View>
      {right}
      {chevron && <Sym name="chevron.forward" size={14} color={C.tertiary} weight="semibold" />}
    </View>
  );
  return onPress ? <Press onPress={onPress}>{content}</Press> : content;
}

/* ---------------------------------------------------------- segmented --- */

export function Segmented<K extends string>({ options, value, onChange, style }: {
  options: { key: K; label: string; dot?: string }[]; value: K; onChange: (k: K) => void; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: C.fill, borderRadius: R.pill, padding: 3, height: 36 }, style]}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{ flex: 1, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: active ? C.white : 'transparent' }}
          >
            {o.dot && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: o.dot }} />}
            <Text style={{ fontSize: 14, fontWeight: active ? '600' : '400', color: C.label }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ----------------------------------------------------------- pantallas --- */

/** Pantalla de tab: fondo agrupado, safe area arriba y aire abajo para la tab bar flotante. */
export function Screen({ children, scroll = true, tabBar = true, ...rest }: { children: React.ReactNode; scroll?: boolean; tabBar?: boolean } & ScrollViewProps) {
  const insets = useSafeAreaInsets();
  const padding = { paddingTop: insets.top + 8, paddingBottom: (tabBar ? 110 : 24) + insets.bottom };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: C.groupedBg }, padding]}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.groupedBg }} contentContainerStyle={padding} keyboardShouldPersistTaps="handled" {...rest}>
      {children}
    </ScrollView>
  );
}

export function LargeTitle({ title, subtitle, style }: { title: string; subtitle?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 }, style]}>
      <Text style={T.largeTitle} accessibilityRole="header">{title}</Text>
      {subtitle && <Text style={[T.subhead, { color: C.secondary, marginTop: 2 }]}>{subtitle}</Text>}
    </View>
  );
}

export function EmptyCard({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: R.card, marginHorizontal: 16, padding: 28, alignItems: 'center' }}>
      <Text style={[T.headline, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[T.subhead, { color: C.secondary, textAlign: 'center', marginTop: 6 }]}>{body}</Text>
      {action && <View style={{ marginTop: 16, alignSelf: 'stretch' }}>{action}</View>}
    </View>
  );
}

export function ErrorLine({ message, onDark }: { message?: string | null; onDark?: boolean }) {
  if (!message) return null;
  return <Text style={{ color: onDark ? C.bidLight : C.bidText, fontSize: 14, fontWeight: '500', marginTop: 10 }}>{message}</Text>;
}

/** Encabezado de sheet: título + botón cerrar circular. */
export function SheetHeader({ eyebrow, eyebrowIcon, eyebrowColor = C.tintText, title, subtitle, onClose, size = 'title2' }: {
  eyebrow?: string; eyebrowIcon?: SymbolName; eyebrowColor?: string; title: string; subtitle?: string;
  onClose?: () => void; size?: 'title1' | 'title2';
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, gap: 12 }}>
      <View style={{ flex: 1 }}>
        {eyebrow && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            {eyebrowIcon && <Sym name={eyebrowIcon} size={14} color={eyebrowColor} />}
            <Text style={{ fontSize: 13, fontWeight: '600', color: eyebrowColor }}>{eyebrow}</Text>
          </View>
        )}
        <Text style={T[size]}>{title}</Text>
        {subtitle && <Text style={[T.subhead, { color: C.secondary, marginTop: 4 }]}>{subtitle}</Text>}
      </View>
      {onClose && <Circle icon="xmark" size={36} bg={C.fill} onPress={onClose} label="Cerrar" />}
    </View>
  );
}

/* ------------------------------------------------------------- toasts --- */

const ToastCtx = React.createContext<(text: string) => void>(() => {});
export const useToast = () => React.useContext(ToastCtx);

/** Pill blanca arriba al centro, 2,6 s (handoff → Interactions). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = React.useState<string | null>(null);
  const opacity = React.useRef(new Animated.Value(0)).current;
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = React.useCallback((value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setText(null));
    }, 2600);
  }, [opacity]);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {text && (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[{ position: 'absolute', top: insets.top + 4, alignSelf: 'center', opacity, borderRadius: R.pill, overflow: 'hidden', maxWidth: '90%' }, shadow.toast]}
        >
          <BlurView intensity={60} tint="light" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: 'rgba(255,255,255,.95)' }}>
            <Sym name="checkmark.circle.fill" size={18} color={C.tint} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.forest }}>{text}</Text>
          </BlurView>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------ imágenes --- */

/** Foto real si hay URL; si no, el bloque de color a rayas del producto. */
export function Img({ url, color = C.tint, style, radius = R.thumb, dim, children }: {
  url?: string | null; color?: string | null; style?: StyleProp<ViewStyle>; radius?: number; dim?: boolean; children?: React.ReactNode;
}) {
  if (!url) return <Placeholder color={color || C.tint} style={[style, dim && { opacity: 0.5 }]} radius={radius}>{children}</Placeholder>;
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: C.fill2 }, style]}>
      <Image source={{ uri: url }} style={[StyleSheet.absoluteFill, dim && { opacity: 0.5 }]} resizeMode="cover" />
      {children}
    </View>
  );
}

/* ------------------------------------------------------- ProductoCard --- */

const CARD_CHIPS: Record<string, { bg: string; fg: string }> = {
  envio: { bg: 'rgba(255,255,255,.92)', fg: '#0A4A3C' },
  oferta: { bg: C.label, fg: C.white },
  nuevo: { bg: C.tint, fg: C.white },
  agotado: { bg: 'rgba(0,0,0,.62)', fg: C.white },
};

/** ProductoCard del handoff: foto 1:1, corazón, chip, título, precio y vendedor. */
export function ProductCard({ product, width, onToggleFav }: { product: any; width?: number; onToggleFav?: (p: any) => void }) {
  const soldOut = product.available === 0;
  const chip = soldOut ? { type: 'agotado', label: 'Agotado' } : product.chip;
  const c = chip ? CARD_CHIPS[chip.type] || CARD_CHIPS.nuevo : null;
  return (
    <Press onPress={() => router.push(`/producto/${product.id}`)} style={[{ gap: 6 }, width ? { width } : { flex: 1 }]} accessibilityLabel={`${product.title}, ${bs(product.price)}`}>
      <Img url={product.photoUrl} color={product.color} radius={18} dim={soldOut} style={{ aspectRatio: 1, width: '100%' }}>
        {onToggleFav && (
          <Pressable onPress={() => onToggleFav(product)} hitSlop={8} accessibilityLabel={product.favorite ? 'Quitar de deseos' : 'Guardar en deseos'}
            style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,.32)', alignItems: 'center', justifyContent: 'center' }}>
            <Sym name={product.favorite ? 'heart.fill' : 'heart'} size={16} color={product.favorite ? C.bidLight : C.white} />
          </Pressable>
        )}
        {c && chip && <Chip label={chip.label} bg={c.bg} fg={c.fg} style={{ position: 'absolute', left: 8, bottom: 8 }} />}
      </Img>
      <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: '600', color: C.label, lineHeight: 19 }}>{product.title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={[{ fontSize: 15, fontWeight: '700', color: C.tintText }, T.num]}>{product.maxPrice > product.price ? `Desde ${bs(product.price)}` : bs(product.price)}</Text>
        {product.compareAt ? <Text style={[{ fontSize: 13, color: C.secondary, textDecorationLine: 'line-through' }, T.num]}>{bs(product.compareAt)}</Text> : null}
      </View>
      {product.seller && (
        <Text numberOfLines={1} style={[T.footnote, T.num]}>{product.seller.name}{product.seller.ratingPct != null ? ` · ★ ${product.seller.ratingPct} %` : ''}</Text>
      )}
    </Press>
  );
}

/** Grilla de 2 columnas (gap 18 vertical × 12 horizontal). */
export function ProductGrid({ products, onToggleFav, style }: { products: any[]; onToggleFav?: (p: any) => void; style?: StyleProp<ViewStyle> }) {
  const rows: any[][] = [];
  for (let i = 0; i < products.length; i += 2) rows.push(products.slice(i, i + 2));
  return (
    <View style={[{ paddingHorizontal: 16, gap: 18 }, style]}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
          {r.map((p) => <ProductCard key={p.id} product={p} onToggleFav={onToggleFav} />)}
          {r.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}

/* --------------------------------------------------------- controles --- */

/** Stepper −/+; en el mínimo, el "−" se vuelve papelera si se pasa onRemove. */
export function Stepper({ value, min = 1, max = 99, onChange, onRemove, small }: {
  value: number; min?: number; max?: number; onChange: (n: number) => void; onRemove?: () => void; small?: boolean;
}) {
  const h = small ? 32 : 36;
  const trash = onRemove && value <= min;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.fill, borderRadius: R.pill, height: h, paddingHorizontal: 4 }}>
      <Pressable hitSlop={6} accessibilityLabel={trash ? 'Quitar' : 'Restar uno'} onPress={() => (trash ? onRemove!() : value > min && onChange(value - 1))}
        style={{ width: h, height: h, alignItems: 'center', justifyContent: 'center', opacity: !trash && value <= min ? 0.35 : 1 }}>
        <Sym name={trash ? 'trash' : 'minus'} size={14} color={trash ? C.destructive : C.label} weight="semibold" />
      </Pressable>
      <Text style={[{ minWidth: 24, textAlign: 'center', fontSize: 16, fontWeight: '600', color: C.label }, T.num]}>{value}</Text>
      <Pressable hitSlop={6} accessibilityLabel="Sumar uno" onPress={() => value < max && onChange(value + 1)}
        style={{ width: h, height: h, alignItems: 'center', justifyContent: 'center', opacity: value >= max ? 0.35 : 1 }}>
        <Sym name="plus" size={14} color={C.label} weight="semibold" />
      </Pressable>
    </View>
  );
}

/** Chip de filtro: activo = fondo label/blanco (o verde suave con check). */
export function FilterChip({ label, active, onPress, count, tone = 'dark', icon }: {
  label: string; active?: boolean; onPress?: () => void; count?: number; tone?: 'dark' | 'green'; icon?: SymbolName;
}) {
  const on = tone === 'green' ? { bg: SOFT.green.bg, fg: C.tintText } : { bg: C.label, fg: C.white };
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={{ height: 34, borderRadius: R.pill, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: active ? on.bg : C.white, borderWidth: active ? 0 : StyleSheet.hairlineWidth, borderColor: C.separator }}>
      {active && tone === 'green' && <Sym name="checkmark" size={12} color={on.fg} weight="bold" />}
      {icon && <Sym name={icon} size={14} color={active ? on.fg : C.label} />}
      <Text style={[{ fontSize: 14, fontWeight: '600', color: active ? on.fg : C.label }, T.num]}>{label}{count != null ? ` · ${count}` : ''}</Text>
    </Press>
  );
}

export function ChipRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0 }, style]} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
      {children}
    </ScrollView>
  );
}

/** Aviso suave (verde, ámbar, rojo o gris) con ícono. */
export function Notice({ tone = 'amber', icon, children, style, action }: {
  tone?: keyof typeof SOFT; icon?: SymbolName; children: React.ReactNode; style?: StyleProp<ViewStyle>; action?: React.ReactNode;
}) {
  const t = SOFT[tone];
  return (
    <View style={[{ backgroundColor: t.bg, borderRadius: 18, marginHorizontal: 16, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, style]}>
      {icon && <Sym name={icon} size={18} color={t.fg} />}
      <View style={{ flex: 1, gap: 8 }}>
        {typeof children === 'string' ? <Text style={{ fontSize: 15, lineHeight: 20, color: t.fg }}>{children}</Text> : children}
        {action}
      </View>
    </View>
  );
}

/** Campo de formulario dentro de un Group: etiqueta arriba, input grande. */
export function Field({ label, hint, style, ...input }: { label: string; hint?: string; style?: StyleProp<ViewStyle> } & TextInputProps) {
  return (
    <View style={[{ paddingHorizontal: 16, paddingVertical: 10, gap: 4 }, style]}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: C.secondary }}>{label}</Text>
      <TextInput placeholderTextColor={C.tertiary} {...input}
        style={[{ fontSize: 17, color: C.label, paddingVertical: 4, minHeight: 28 }, input.multiline && { minHeight: 72, textAlignVertical: 'top' }]} />
      {hint && <Text style={T.footnote}>{hint}</Text>}
    </View>
  );
}

export function SwitchRow({ title, subtitle, value, onChange, icon }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; icon?: SymbolName }) {
  return <Row icon={icon} title={title} subtitle={subtitle} right={<Switch value={value} onValueChange={onChange} trackColor={{ true: C.tint }} />} />;
}

/** Barra fija inferior con vidrio (D5–D8, E2). */
export function BottomBar({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator }, style]}>
      <BlurView intensity={40} tint="light" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(244,242,238,.92)' }]} />
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12), gap: 10 }}>{children}</View>
    </View>
  );
}

/** Barra de navegación compacta para pantallas push: atrás, título y acciones. */
export function NavBar({ title, right, onBack, transparent }: { title?: string; right?: React.ReactNode; onBack?: () => void; transparent?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: transparent ? 'transparent' : C.groupedBg }}>
      <Circle icon="chevron.backward" size={40} bg={C.white} onPress={onBack || (() => (router.canGoBack() ? router.back() : router.replace('/')))} label="Volver" />
      <Text numberOfLines={1} style={[T.headline, { flex: 1, textAlign: 'center' }]}>{title || ''}</Text>
      <View style={{ minWidth: 40, flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>{right}</View>
    </View>
  );
}

/** Bloque gris para estados de carga. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: C.fill, borderRadius: 14, opacity: 0.6 }, style]} />;
}

export function Loading() {
  return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={C.tint} /></View>;
}

/** Fila de total "Total a pagar  Bs 1.240". */
export function TotalLine({ label, value, big }: { label: string; value: number; big?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Text style={big ? T.headline : [T.subhead, { color: C.secondary }]}>{label}</Text>
      <Text style={[big ? { fontSize: 24, fontWeight: '700', color: C.tintText } : T.subhead, T.num]}>{bs(value)}</Text>
    </View>
  );
}
