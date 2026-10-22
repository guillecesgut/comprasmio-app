import React from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api, upload, type Upload } from '@/api';
import { useSession } from '@/session';
import { pickFromLibrary } from '@/pickers';
import { SheetHeader, Btn, Press, Sym, ErrorLine, Group, Row, useToast } from '@/ui';
import { C, T, R } from '@/theme';

/** D12 · ¿Recibiste todo bien? → reseña con estrellas, o "Tengo un problema" (D13). */
export default function Recepcion() {
  const { id = '', resena } = useLocalSearchParams<{ id: string; resena?: string }>();
  const toast = useToast();
  const { refreshBadges } = useSession();
  const [step, setStep] = React.useState<'ask' | 'review'>(resena ? 'review' : 'ask');
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState('');
  const [photo, setPhoto] = React.useState<Upload | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.confirmReceived(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshBadges();
      setStep('review');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const photoKey = photo ? (await upload('reviews', photo)).key : undefined;
      await api.review(id, { rating, comment: comment.trim() || undefined, photoKey });
      toast('¡Gracias por tu reseña!');
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'ask') {
    return (
      <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
        <SheetHeader title="¿Recibiste todo bien?" subtitle="Al confirmar, le liberamos el pago al vendedor en el próximo corte." onClose={() => router.back()} />
        <View style={{ padding: 16, gap: 12 }}>
          <Press onPress={confirm} disabled={busy} style={{ backgroundColor: C.white, borderRadius: R.card, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Sym name="checkmark.circle.fill" size={30} color={C.tint} />
            <View style={{ flex: 1 }}><Text style={T.headline}>Sí, todo bien</Text><Text style={T.footnote}>Marcamos el pedido como entregado.</Text></View>
          </Press>
          <Press onPress={() => router.replace(`/pedido/reclamo/${id}`)} style={{ backgroundColor: C.white, borderRadius: R.card, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Sym name="exclamationmark.bubble" size={30} color={C.destructive} />
            <View style={{ flex: 1 }}><Text style={T.headline}>Tengo un problema</Text><Text style={T.footnote}>No llegó, llegó dañado o no es lo que compraste.</Text></View>
          </Press>
          <ErrorLine message={error} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.groupedBg }} keyboardShouldPersistTaps="handled">
      <SheetHeader title="Calificá tu compra" subtitle="Tu reseña ayuda a otros compradores." onClose={() => router.back()} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 12 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} hitSlop={6} onPress={() => { Haptics.selectionAsync(); setRating(n); }} accessibilityLabel={`${n} estrellas`}>
            <Sym name={n <= rating ? 'star.fill' : 'star'} size={38} color={n <= rating ? C.bidLight : C.tertiary} />
          </Pressable>
        ))}
      </View>
      <Group>
        <TextInput value={comment} onChangeText={setComment} multiline maxLength={600} placeholder="Contá cómo te fue (opcional)"
          placeholderTextColor={C.tertiary} style={{ minHeight: 100, padding: 16, fontSize: 16, color: C.label, textAlignVertical: 'top' }} />
        <Row icon="photo" title={photo ? 'Foto agregada' : 'Agregar una foto (opcional)'} onPress={async () => {
          try { const r = await pickFromLibrary(); if (r) setPhoto(r[0]); } catch (e: any) { setError(e.message); }
        }} right={photo ? <Pressable onPress={() => setPhoto(null)}><Text style={{ color: C.destructive }}>Quitar</Text></Pressable> : undefined} />
      </Group>
      <View style={{ padding: 16, gap: 10 }}>
        <ErrorLine message={error} />
        <Btn title="Enviar reseña" disabled={!rating} loading={busy} onPress={send} />
        <Btn title="Ahora no" tone="plain" onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}
