import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Thread } from '@/Thread';

/** B7 · Chat con un vendedor. */
export default function ChatVendedor() {
  const { sellerId = '', order } = useLocalSearchParams<{ sellerId: string; order?: string }>();
  return <Thread side="buyer" sellerId={sellerId} orderId={order} />;
}
