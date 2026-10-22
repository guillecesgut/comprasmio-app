import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sym, Badge, type SymbolName } from './ui';
import { C, shadow } from './theme';

export type TabSpec = { name: string; label: string; icon: SymbolName; iconActive?: SymbolName; dot?: boolean };

/**
 * Tab bar flotante del handoff: pill de vidrio (blanco 80 % + blur), alto 62.
 * El vendedor tiene además el botón circular "Transmitir" a la derecha (ámbar en
 * todos los vendedores). Se dibuja a mano porque el botón
 * Transmitir no es una tab (abre una hoja) y NativeTabs no lo permite.
 */
export function FloatingTabBar({ state, navigation, descriptors, tabs, extra }: {
  state: any; navigation: any; descriptors: any; tabs: TabSpec[];
  extra?: { icon: SymbolName; label: string; onPress: () => void; tone: 'glass' | 'bid' | 'locked' };
}) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom - 6, 12);

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 }}>
      <View style={[styles.bar, shadow.tabBar]}>
        <BlurView intensity={70} tint="systemChromeMaterialLight" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,.8)' }]} />
        {tabs.map((tab) => {
          const index = state.routes.findIndex((r: any) => r.name === tab.name);
          if (index < 0) return null;
          const route = state.routes[index];
          const focused = state.index === index;
          const badge = descriptors[route.key]?.options?.tabBarBadge as number | undefined;
          const color = focused ? C.tintText : C.label;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              Haptics.selectionAsync();
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={tab.name}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={badge ? `${tab.label}, ${badge} pendientes` : tab.label}
              style={[styles.item, focused && { backgroundColor: 'rgba(14,124,102,.12)' }]}
            >
              <View>
                <Sym name={focused ? tab.iconActive || tab.icon : tab.icon} size={22} color={color} />
                {!!badge && <Badge count={badge} style={{ position: 'absolute', top: -7, right: -12 }} />}
                {!badge && tab.dot && <View style={{ position: 'absolute', top: -2, right: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: C.bid, borderWidth: 1.5, borderColor: C.white }} />}
              </View>
              <Text style={{ fontSize: 10, fontWeight: '600', color, marginTop: 3 }}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {extra && (
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); extra.onPress(); }}
          accessibilityRole="button"
          accessibilityLabel={extra.label}
          style={({ pressed }) => [
            styles.extra,
            extra.tone === 'bid' ? [{ backgroundColor: C.bid }, shadow.transmit] : extra.tone === 'locked' ? [{ backgroundColor: 'rgba(230,225,216,.9)' }, shadow.tabBar] : shadow.tabBar,
            pressed && { transform: [{ scale: 0.96 }] },
          ]}
        >
          {extra.tone === 'glass' && (
            <BlurView intensity={70} tint="systemChromeMaterialLight" style={[StyleSheet.absoluteFill, { borderRadius: 31, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,.8)' }]} />
          )}
          <Sym name={extra.icon} size={extra.tone === 'locked' ? 22 : 24} color={extra.tone === 'bid' ? C.white : C.label} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flex: 1, height: 62, borderRadius: 31, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5,
    overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,.08)',
  },
  item: { flex: 1, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  extra: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
});
