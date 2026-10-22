import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

/** Degradado inferior oscuro para que el texto blanco se lea sobre fotos (banners, portadas). */
export function LinearGradientLike({ from = 0.35, opacity = 0.62 }: { from?: number; opacity?: number }) {
  const id = React.useId().replace(/:/g, '');
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset={from} stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={opacity} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
