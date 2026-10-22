import React from 'react';
import { View } from 'react-native';
import { Img } from './ui';
import { C } from './theme';

/** Collage de hasta 3 miniaturas (E4, E9). */
export function Collage({ bundle, size = 64 }: { bundle: any; size?: number }) {
  if (bundle.photoUrl) return <Img url={bundle.photoUrl} radius={12} style={{ width: size, height: size }} />;
  const pieces = bundle.pieces.slice(0, 3);
  const s = size * 0.62;
  return (
    <View style={{ width: size, height: size }}>
      {pieces.map((p: any, i: number) => (
        <Img key={i} url={p.photoUrl} color={p.color} radius={10}
          style={{ position: 'absolute', width: s, height: s, left: i * (size - s) / 2, top: i * (size - s) / 2, borderWidth: 2, borderColor: C.white }} />
      ))}
    </View>
  );
}
