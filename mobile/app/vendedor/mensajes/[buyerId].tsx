import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Thread } from '@/Thread';

/** Hilo con un comprador (vista vendedor, desde C8). */
export default function ChatComprador() {
  const { buyerId = '', order } = useLocalSearchParams<{ buyerId: string; order?: string }>();
  return <Thread side="seller" buyerId={buyerId} orderId={order} />;
}
