import React from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Animated,
  type ViewStyle, type StyleProp, type TextStyle, type ScrollViewProps,
} from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Path, Circle as SvgCircle, Defs, Pattern, Line } from 'react-native-svg';
import { C, T, R, MODE, STATUS, shadow } from './theme';
import type { Mode } from './api';

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

export function ModeChip({ mode, solid }: { mode: Mode; solid?: boolean }) {
  const m = MODE[mode] || MODE.auction;
  return <Chip label={m.label} bg={solid ? m.solid : m.soft} fg={solid ? C.white : m.softFg} />;
}

export function StatusChip({ status, suffix }: { status: string; suffix?: string }) {
  const s = STATUS[status] || STATUS.enviado;
  return <Chip label={suffix ? `${s.label} · ${suffix}` : s.label} bg={s.bg} fg={s.fg} />;
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
