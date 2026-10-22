import { Alert } from 'react-native';
import { api } from './api';

/** Pide el número de seguimiento (opcional) y marca el pedido como enviado. */
export function askShip(order: any, done: () => void, fail: (msg: string) => void) {
  Alert.prompt('Marcar enviado', 'Número de seguimiento (opcional). El comprador lo ve en su pedido.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Marcar enviado', onPress: (tracking?: string) => api.seller_.advance(order.id, 'enviado', { tracking: tracking?.trim() || undefined }).then(done).catch((e) => fail(e.message)) },
  ], 'plain-text');
}
