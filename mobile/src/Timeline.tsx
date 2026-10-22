import React from 'react';
import { View, Text } from 'react-native';
import { Sym } from './ui';
import { shortDate } from './format';
import { C, T } from './theme';

type Step = { key: string; label: string; at: string | null; detail?: string | null };

/**
 * Seguimiento del pedido: vertical en D11 (comprador), horizontal de 4 pasos en E6 (vendedor).
 * Hecho = punto verde con check; pendiente = anillo.
 */
export function Timeline({ steps, horizontal }: { steps: Step[]; horizontal?: boolean }) {
  // Un paso cuenta como hecho si él o alguno posterior tiene fecha.
  const lastDone = steps.reduce((acc, s, i) => (s.at ? i : acc), -1);
  const dot = (done: boolean) => (
    <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
      backgroundColor: done ? C.tint : C.white, borderWidth: done ? 0 : 2, borderColor: C.grabber }}>
      {done && <Sym name="checkmark" size={12} color={C.white} weight="bold" />}
    </View>
  );

  if (horizontal) {
    return (
      <View style={{ flexDirection: 'row' }}>
        {steps.map((s, i) => {
          const done = i <= lastDone;
          return (
            <View key={s.key} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
                <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : i <= lastDone ? C.tint : C.grabber }} />
                {dot(done)}
                <View style={{ flex: 1, height: 2, backgroundColor: i === steps.length - 1 ? 'transparent' : i < lastDone ? C.tint : C.grabber }} />
              </View>
              <Text style={{ fontSize: 12, fontWeight: done ? '600' : '400', color: done ? C.label : C.secondary, textAlign: 'center' }}>{s.label}</Text>
              {s.at && <Text style={[T.footnote, { fontSize: 11 }]}>{shortDate(s.at)}</Text>}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View>
      {steps.map((s, i) => {
        const done = i <= lastDone;
        return (
          <View key={s.key} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center' }}>
              {dot(done)}
              {i < steps.length - 1 && <View style={{ width: 2, flex: 1, minHeight: 22, backgroundColor: i < lastDone ? C.tint : C.grabber }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: done ? '600' : '400', color: done ? C.label : C.secondary }}>{s.label}</Text>
              {(s.at || s.detail) && <Text style={T.footnote}>{[s.at && shortDate(s.at), s.detail].filter(Boolean).join(' · ')}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}
