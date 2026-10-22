import React from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { Press, Img, LivePill, ViewersPill } from './ui';
import { C, T } from './theme';

/** Tarjeta 3:4 de vivo (D1, B1, D4). */
export function LiveCard({ stream, width }: { stream: any; width?: number }) {
  return (
    <Press onPress={() => router.push(`/vivo/${stream.id}`)} style={width ? { width } : { flex: 1 }} accessibilityLabel={`${stream.seller.name} en vivo: ${stream.title}`}>
      <Img url={stream.photoUrl} color={stream.color} radius={18} style={{ aspectRatio: 3 / 4, width: '100%' }}>
        <View style={{ position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
          <LivePill height={22} />
        </View>
        <View style={{ position: 'absolute', left: 8, bottom: 8 }}><ViewersPill viewers={stream.viewers} height={22} /></View>
      </Img>
      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: C.label, marginTop: 6 }}>{stream.seller.name}</Text>
      <Text numberOfLines={1} style={T.footnote}>{stream.title}</Text>
    </Press>
  );
}

