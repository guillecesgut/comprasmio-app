import React from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActionSheetIOS, StyleSheet } from 'react-native';
import { api } from '@/api';
import { useData } from '@/hooks';
import { shortDate } from '@/format';
import { NavBar, Avatar, Img, Btn, Loading, EmptyCard, ErrorLine, useToast } from '@/ui';
import { C, T, R } from '@/theme';

/** E12 · Reseñas con distribución por estrellas y una respuesta por reseña. */
export default function Resenas() {
  const toast = useToast();
  const [stars, setStars] = React.useState<number | undefined>();
  const { data, error, reload } = useData(() => api.seller_.reviews(stars), [stars]);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const reply = (r: any) => Alert.prompt('Responder', 'Tu respuesta es pública y no se puede editar después.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Publicar', onPress: (text?: string) => text?.trim() && api.seller_.replyReview(r.id, text).then(() => { toast('Respuesta publicada'); reload(); }).catch((e) => setActionError(e.message)) },
  ], 'plain-text');

  const more = (r: any) => ActionSheetIOS.showActionSheetWithOptions(
    { options: ['Reportar reseña', 'Cancelar'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
    (i) => i === 0 && api.report({ text: `Reseña ${r.id}: ${r.comment || ''}`, reason: 'resena' })
      .then(() => toast('Gracias. La revisamos.')).catch((e) => setActionError(e.message))
  );

  const total = data ? Object.values(data.distribution as Record<string, number>).reduce((a, b) => a + b, 0) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Reseñas" />
      {!data ? (error ? <ErrorLine message={error} /> : <Loading />) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          <View style={styles.summary}>
            <View style={{ alignItems: 'center', width: 96 }}>
              <Text style={[{ fontSize: 40, fontWeight: '700', color: C.label }, T.num]}>{data.count ? String(data.avg).replace('.', ',') : '—'}</Text>
              <Text style={{ color: C.bidLight }}>★★★★★</Text>
              <Text style={T.footnote}>{data.count} reseñas</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              {[5, 4, 3, 2, 1].map((n) => {
                const c = data.distribution[n] || 0;
                return (
                  <Pressable key={n} onPress={() => setStars(stars === n ? undefined : n)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: !stars || stars === n ? 1 : 0.4 }}>
                    <Text style={[T.footnote, { width: 14 }]}>{n}</Text>
                    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.fill2, overflow: 'hidden' }}>
                      <View style={{ width: `${total ? (c / total) * 100 : 0}%`, height: 6, backgroundColor: C.bidLight }} />
                    </View>
                    <Text style={[T.footnote, T.num, { width: 24, textAlign: 'right' }]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ paddingHorizontal: 16 }}><ErrorLine message={actionError} /></View>
          {!data.items.length ? (
            <EmptyCard title={stars ? `Sin reseñas de ${stars} estrellas` : 'Todavía no hay reseñas'} body="Las reseñas aparecen cuando los compradores confirman que recibieron su pedido." />
          ) : (
            <View style={{ gap: 12 }}>
              {data.items.map((r: any) => (
                <Pressable key={r.id} onLongPress={() => more(r)} style={styles.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar initials={r.initials} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text style={T.headline}>{r.buyer}</Text>
                      <Text style={T.footnote}>{r.product ? `${r.product} · ` : ''}{shortDate(r.at)}</Text>
                    </View>
                    <Text style={{ color: C.bidLight }}>{'★'.repeat(r.rating)}<Text style={{ color: C.fill }}>{'★'.repeat(5 - r.rating)}</Text></Text>
                  </View>
                  {!!r.comment && <Text style={T.subhead}>{r.comment}</Text>}
                  {r.photoUrl && <Img url={r.photoUrl} radius={12} style={{ width: 96, height: 96 }} />}
                  {r.reply ? (
                    <View style={{ backgroundColor: C.groupedBg, borderRadius: 14, padding: 12 }}>
                      <Text style={[T.footnote, { fontWeight: '600', color: C.label }]}>Tu respuesta</Text>
                      <Text style={T.subhead}>{r.reply}</Text>
                    </View>
                  ) : <Btn title="Responder" tone="tonal" height={36} style={{ alignSelf: 'flex-start' }} onPress={() => reply(r)} />}
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, marginBottom: 12, padding: 16, flexDirection: 'row', gap: 16, alignItems: 'center' },
  card: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, padding: 16, gap: 10 },
});
