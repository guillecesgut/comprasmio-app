import React from 'react';
import { View, Text, ScrollView, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, bs } from '@/api';
import { useData } from '@/hooks';
import { shortDate } from '@/format';
import { NavBar, Circle, Group, Row, Img, StatusChip, Btn, Notice, Loading, ErrorLine, SectionHeader, TotalLine } from '@/ui';
import { Timeline } from '@/Timeline';
import { C, T } from '@/theme';

const CLAIM_STATUS: Record<string, string> = {
  abierto: 'Recibimos tu reclamo. Lo estamos revisando.',
  esperando_vendedor: 'Le pedimos al vendedor que responda.',
  resuelto_comprador: 'Resuelto a tu favor.',
  resuelto_vendedor: 'Resuelto: el pedido se dio por entregado.',
};

/** D11 · Detalle de pedido (comprador). */
export default function PedidoComprador() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { data: o, error } = useData(() => api.order(id).then((r) => r.order), [id], { events: ['order:update'] });

  if (!o) return <View style={{ flex: 1, backgroundColor: C.groupedBg }}><NavBar />{error ? <View style={{ padding: 16 }}><ErrorLine message={error} /></View> : <Loading />}</View>;

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar right={<Circle icon="bubble.left" size={40} onPress={() => router.push(`/chat/${o.seller.id}?order=${o.id}`)} label="Chat con el vendedor" />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 20, gap: 6 }}>
          <Text style={[T.title1, { fontFamily: 'Menlo', fontSize: 24 }]}>{o.ref}</Text>
          <Text style={[T.subhead, { color: C.secondary }]}>{o.seller.name} · {shortDate(o.createdAt)}</Text>
          <StatusChip status={o.status} />
        </View>

        {o.status === 'pendiente_pago' && (
          <View style={{ padding: 16 }}><Btn title={`Pagar ahora · ${bs(o.total)}`} onPress={() => router.push(`/pago/${o.paymentId}`)} /></View>
        )}
        {o.claim && (
          <Notice tone="red" icon="exclamationmark.bubble" style={{ marginTop: 14 }}>
            {`${CLAIM_STATUS[o.claim.status] || 'Reclamo en curso.'}${o.claim.resolutionNote ? ` ${o.claim.resolutionNote}` : ''}${o.claim.refund ? ` Reembolso: ${bs(o.claim.refund)}.` : ''}`}
          </Notice>
        )}

        {!['pendiente_pago', 'pago_en_revision', 'vencido', 'cancelado'].includes(o.status) && (
          <>
            <SectionHeader title="Seguimiento" />
            <Group><View style={{ padding: 16 }}><Timeline steps={o.steps} /></View></Group>
          </>
        )}

        <SectionHeader title="Productos" />
        <Group inset={88}>
          {o.items.map((i: any) => (
            <Row key={i.id} onPress={i.productId ? () => router.push(`/producto/${i.productId}`) : undefined}
              left={<Img url={i.photoUrl} color={i.color} radius={12} style={{ width: 56, height: 56 }} />}
              title={i.title} subtitle={`${i.label !== 'Única' && i.label ? `${i.label} · ` : ''}${i.qty} × ${bs(i.unitPrice)}`}
              right={<Text style={[T.subhead, T.num]}>{bs(i.total)}</Text>} />
          ))}
          <View style={{ padding: 16, gap: 6 }}>
            <TotalLine label="Productos" value={o.subtotal} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[T.subhead, { color: C.secondary }]}>Envío</Text>
              <Text style={T.subhead}>{o.deliveryMethod === 'retiro' ? 'Retiro en persona' : o.shipping ? bs(o.shipping) : o.shippingMode === 'a_convenir' ? 'A convenir' : 'Gratis'}</Text>
            </View>
            <TotalLine label="Total" value={o.total} big />
          </View>
        </Group>

        <SectionHeader title="Entrega" />
        <Group>
          {o.deliveryMethod === 'retiro'
            ? <Row icon="storefront" title="Retiro en persona" subtitle="Coordiná el lugar con el vendedor por el chat." />
            : o.address && <Row icon="mappin.and.ellipse" title={o.address.label || 'Dirección'} subtitle={[o.address.street, o.address.zone, o.address.city].filter(Boolean).join(', ')} />}
          {o.tracking && <Row icon="shippingbox" title={o.carrier || 'Envío'} subtitle={`Guía ${o.tracking}`} />}
          {o.receiptUrl && <Row icon="doc.text" title="Comprobante de pago" subtitle={o.paymentRef} chevron onPress={() => Linking.openURL(o.receiptUrl)} />}
        </Group>

        <View style={{ padding: 16, gap: 10 }}>
          {o.canConfirm && <Btn title="Confirmar que lo recibí" onPress={() => router.push(`/pedido/recepcion/${o.id}`)} />}
          {o.canReview && <Btn title="Calificar al vendedor" onPress={() => router.push(`/pedido/recepcion/${o.id}?resena=1`)} />}
          {o.canClaim && <Btn title="Tengo un problema" tone="tonal" onPress={() => router.push(`/pedido/reclamo/${o.id}`)} />}
          {o.status === 'enviado' && (
            <Text style={[T.footnote, { textAlign: 'center' }]}>Si no confirmás ni reclamás, lo damos por entregado a los {o.autoDeliverDays} días del envío.</Text>
          )}
          {o.review && <Notice tone="green" icon="star.fill" style={{ marginHorizontal: 0 }}>{`Calificaste con ${o.review.rating} ${o.review.rating === 1 ? 'estrella' : 'estrellas'}. ¡Gracias!`}</Notice>}
        </View>
      </ScrollView>
    </View>
  );
}
