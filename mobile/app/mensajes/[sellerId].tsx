import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/api';
import { Thread } from '@/Thread';

/** B7 · Mensajes: el comprador coordina la entrega con el vendedor. */
export default function Mensajes() {
  const { sellerId = '', orden } = useLocalSearchParams<{ sellerId: string; orden?: string }>();
  const [seller, setSeller] = React.useState<any>(null);

  React.useEffect(() => {
    api.sellerInfo(sellerId).then(({ seller }) => setSeller(seller)).catch(() => {});
  }, [sellerId]);

  return (
    <Thread
      title={seller?.name || 'Mensajes'}
      initials={seller?.initials || '?'}
      side="buyer"
      orderId={orden}
      fetchThread={() => api.threadWith(sellerId)}
      sendMessage={(text) => api.messageSeller(sellerId, text)}
      belongs={(m) => m.sellerId === sellerId}
      placeholder={`Escribile a ${seller?.name || 'tu vendedor'}…`}
    />
  );
}
