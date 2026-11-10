import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { C } from './theme';

/** Símbolos de iOS (SF Symbols). En el navegador Metro usa `symbol.web.tsx` con los mismos nombres. */
export type SymbolName = SymbolViewProps['name'];

export function Sym({ name, size = 20, color = C.label, weight = 'regular' }: {
  name: SymbolName; size?: number; color?: string; weight?: SymbolViewProps['weight'];
}) {
  return <SymbolView name={name} size={size} tintColor={color} weight={weight} resizeMode="scaleAspectFit" style={{ width: size, height: size }} />;
}
