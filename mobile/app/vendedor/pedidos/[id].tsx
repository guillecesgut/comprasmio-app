import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { api, bs } from '@/api';
import { useSession } from '@/session';
import { useData } from '@/hooks';
import { shortDate, weekdayDate } from '@/format';
import { askShip } from '@/sellerActions';
import { Timeline } from '@/Timeline';
import { NavBar, Circle, Group, Row, Img, StatusChip, Chip, Btn, Notice, Loading, ErrorLine, SectionHeader, TotalLine, Press, useToast } from '@/ui';
import { C, T, CHANNEL } from '@/theme';

const CLAIM_REASON: Record<string, string> = { no_llego: 'No llegó', danado: 'Llegó dañado', no_es_lo_que_compre: 'No es lo que compró', otro: 'Otro motivo' };

/** E6 · Detalle de pedido (vendedor): entrega, seguimiento y "lo que recibís". */
export default function PedidoVendedor() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { refreshBadges } = useSession();
  const { data: o, error, reload } = useData(() => api.seller_.order(id).then((r) => r.order), [id], { events: ['order:update'] });
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  if (!o) return <View style={{ flex: 1, backgroundColor: C.groupedBg }}><NavBar />{error ? <View style={{ padding: 16 }}><ErrorLine message={error} /></View> : <Loading />}</View>;

  const copy = async (text: string, label: string) => { await Clipboard.setStringAsync(text); toast(`${label} copiado`); };
  const done = (msg: string) => () => { toast(msg); reload(); refreshBadges(); };
  const prepare = async () => {
    setBusy(true);
    try { await api.seller_.advance(o.id, 'preparando'); done('Pedido en preparación')(); } catch (e: any) { setActionError(e.message); } finally { setBusy(false); }
  };
  const ch = CHANNEL[o.channel] || CHANNEL.catalogo;
  const address = o.address ? [o.address.street, o.address.zone, o.address.city].filter(Boolean).join(', ') : '';
  const payoutText = !o.payout ? null
    : o.payout.status === 'retenida' ? 'Retenido por reclamo'
      : o.payout.status === 'pagada' ? 'Ya te lo pagamos'
        : o.payout.status === 'programada' ? `Se paga el ${weekdayDate(o.payout.date)}`
          : `Entra en el pago del ${weekdayDate(o.payout.date)}`;

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar right={<Circle icon="bubble.left" size={40} onPress={() => router.push(`/vendedor/mensajes/${o.buyer.id}?order=${o.id}`)} label="Chat con el comprador" />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 20, gap: 6 }}>
          <Text style={[T.title1, { fontFamily: 'Menlo', fontSize: 24 }]}>{o.ref}</Text>
          <Text style={[T.subhead, { color: C.secondary }]}>@{o.buyer.handle} · {o.buyer.name} · {shortDate(o.createdAt)}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}><StatusChip status={o.status} /><Chip label={ch.label} bg={ch.bg} fg={ch.fg} /></View>
        </View>

        {o.claim && (
          <Notice tone="red" icon="exclamationmark.bubble" style={{ marginTop: 14 }}>
            {`Reclamo: ${CLAIM_REASON[o.claim.reason] || o.claim.reason}. ${o.claim.description || ''} El pago de este pedido queda retenido hasta que ComprasMío! lo resuelva. Respondé por el chat.`}
          </Notice>
        )}

        <SectionHeader title="Productos" />
        <Group inset={88}>
          {o.items.map((i: any) => (
            <Row key={i.id} left={<Img url={i.photoUrl} color={i.color} radius={12} style={{ width: 56, height: 56 }} />}
              title={i.title} subtitle={`${i.label && i.label !== 'Única' ? `${i.label} · ` : ''}${i.qty} × ${bs(i.unitPrice)}`}
              right={<Text style={[T.subhead, T.num]}>{bs(i.total)}</Text>} />
          ))}
        </Group>

        <SectionHeader title="Entrega" />
        <Group>
          {o.deliveryMethod === 'retiro' ? <Row icon="storefront" title="Retiro en persona" subtitle="Coordiná el lugar por el chat." /> : (
            <Row icon="mappin.and.ellipse" title={o.address?.label || 'Dirección'} subtitle={[address, o.address?.reference].filter(Boolean).join(' · ')}
              right={address ? <Press onPress={() => copy(address, 'Dirección')}><Text style={{ color: C.tintText, fontWeight: '600' }}>Copiar</Text></Press> : undefined} />
          )}
          {o.phone && <Row icon="phone" title={`+591 ${o.phone}`} right={<Press onPress={() => copy(o.phone, 'Teléfono')}><Text style={{ color: C.tintText, fontWeight: '600' }}>Copiar</Text></Press>} />}
          <Row icon="shippingbox" title="Envío" subtitle={o.shippingMode === 'envio_gratis' ? 'Envío gratis (lo cubrís vos)' : 'A convenir con el comprador'} />
          {o.tracking && <Row icon="number" title="Seguimiento" subtitle={[o.carrier, o.tracking].filter(Boolean).join(' · ')} />}
        </Group>

        {!['pendiente_pago', 'pago_en_revision', 'vencido', 'cancelado'].includes(o.status) && (
          <>
            <SectionHeader title="Seguimiento" />
            <Group><View style={{ padding: 16 }}><Timeline steps={o.steps} horizontal /></View></Group>
          </>
        )}

        <SectionHeader title="Lo que recibís" />
        <Group>
          <View style={{ padding: 16, gap: 6 }}>
            <TotalLine label="Total del pedido" value={o.total} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[T.subhead, { color: C.secondary }]}>Comisión {o.commissionPct} % (sobre {bs(o.subtotal)})</Text>
              <Text style={[T.subhead, T.num]}>− {bs(o.commission)}</Text>
            </View>
            <TotalLine label="Neto para vos" value={o.net} big />
            {payoutText && <Text style={[T.footnote, { color: o.payout?.status === 'retenida' ? C.destructive : C.secondary }]}>{payoutText}</Text>}
          </View>
        </Group>

        <View style={{ padding: 16, gap: 10 }}>
          <ErrorLine message={actionError} />
          {o.status === 'pagado' && <Btn title="Marcar como preparando" loading={busy} onPress={prepare} />}
          {o.status === 'preparando' && <Btn title="Marcar enviado" onPress={() => askShip(o, done('Pedido enviado'), setActionError)} />}
          {o.status === 'enviado' && <Text style={[T.footnote, { textAlign: 'center' }]}>Esperando que el comprador confirme. Si no lo hace, se da por entregado a los {o.autoDeliverDays} días.</Text>}
          {['pendiente_pago', 'pago_en_revision'].includes(o.status) && <Text style={[T.footnote, { textAlign: 'center' }]}>Todavía no prepares este pedido: esperá a que ComprasMío! confirme el pago.</Text>}
        </View>
      </ScrollView>
    </View>
  );
}
