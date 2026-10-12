import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/api';
import { Thread } from '@/Thread';
import { initialsOf } from '@/format';

/** Hilo con un comprador, visto desde Clientes u Órdenes (vendedor). */
export default function Cliente() {
  const { buyerId = '', orden } = useLocalSearchParams<{ buyerId: string; orden?: string }>();
  const [customer, setCustomer] = React.useState<any>(null);

  React.useEffect(() => {
    api.customers().then(({ customers }) => setCustomer(customers.find((c) => c.id === buyerId) || null)).catch(() => {});
  }, [buyerId]);

  return (
    <Thread
      title={customer ? `@${customer.handle}` : 'Mensajes'}
      initials={initialsOf(customer?.name)}
      side="seller"
      orderId={orden}
      fetchThread={() => api.thread(buyerId)}
      sendMessage={(text) => api.sendMessage(buyerId, text)}
      belongs={(m) => m.buyerId === buyerId}
      placeholder={customer ? `Escribile a @${customer.handle}…` : 'Escribí un mensaje…'}
    />
  );
}
