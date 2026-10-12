import React from 'react';
import { View, Text, Image, ScrollView, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, bs, absolute } from '@/api';
import { SheetHeader, Group, Row, Btn, Sym, ErrorLine, useToast } from '@/ui';
import { ago } from '@/format';
import { C, T, R } from '@/theme';

/** C5 · Revisar comprobante. El monto se repite en el botón para no verificar a ciegas. */
export default function Comprobante() {
  const { orderId = '' } = useLocalSearchParams<{ orderId: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [order, setOrder] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.order(orderId).then(({ order }) => setOrder(order)).catch((e) => setError(e.message));
  }, [orderId]);

  const url = absolute(order?.receiptUrl);
  const isPdf = /\.pdf$/i.test(order?.receiptUrl || '');

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.verifyOrder(orderId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast(`Pago verificado · @${order.buyerHandle} ya lo ve`);
      router.back();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <SheetHeader
          eyebrow={order ? `${order.ref} · @${order.buyerHandle}` : ' '}
          eyebrowColor={C.secondary}
          title="Revisar comprobante"
          onClose={() => router.back()}
        />

        <View style={{ height: 360, marginHorizontal: 16, borderRadius: R.card, overflow: 'hidden', backgroundColor: C.fill2 }}>
          {url && !isPdf ? (
            // Pellizcar para ampliar: el zoom nativo de ScrollView en iOS.
            <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerStyle={{ flexGrow: 1 }}>
              <Image source={{ uri: url }} style={{ width: '100%', height: 360 }} resizeMode="contain" accessibilityLabel="Comprobante de la transferencia" />
            </ScrollView>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <Sym name="doc.text" size={40} color={C.secondary} />
              {url ? <Btn title="Abrir PDF" tone="outlineTint" height={40} onPress={() => Linking.openURL(url)} /> : <Text style={T.footnote}>Sin comprobante todavía</Text>}
            </View>
          )}
        </View>

        <Group style={{ marginTop: 12 }}>
          <Row title={<Text style={[T.body, { color: C.secondary }]}>Monto esperado</Text>} right={<Text style={[T.body, T.num, { fontWeight: '700' }]}>{bs(order?.total ?? 0)}</Text>} />
          <Row title={<Text style={[T.body, { color: C.secondary }]}>Producto</Text>} right={<Text numberOfLines={1} style={[T.body, { maxWidth: 220 }]}>{order?.productName}</Text>} />
          <Row title={<Text style={[T.body, { color: C.secondary }]}>Subido</Text>} right={<Text style={T.body}>{ago(order?.submittedAt || order?.createdAt)}</Text>} />
        </Group>
        <View style={{ paddingHorizontal: 32 }}><ErrorLine message={error} /></View>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16), borderTopWidth: 0.5, borderTopColor: C.separator, gap: 6 }}>
        <Btn title={`Verificar pago de ${bs(order?.total ?? 0)}`} loading={busy} disabled={order?.status !== 'en_revision'} onPress={verify} />
        {order && (
          <Btn
            title={`Escribir a @${order.buyerHandle}`}
            tone="plain"
            height={44}
            textStyle={{ color: C.tintText }}
            onPress={() => { router.back(); router.push(`/cliente/${order.buyerId}?orden=${order.id}`); }}
          />
        )}
      </View>
    </View>
  );
}
