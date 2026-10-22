import React from 'react';
import { View, Text, ScrollView, ActionSheetIOS, TextInput, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { api, bs } from '@/api';
import { useSession } from '@/session';
import { useData } from '@/hooks';
import { NavBar, Group, Row, Img, Avatar, Btn, BottomBar, Notice, Loading, ErrorLine, SectionHeader, TotalLine } from '@/ui';
import { C, T, R } from '@/theme';

/** D7 · Checkout: entrega, un resumen por vendedor y "Ir a pagar" (un pedido por vendedor, un solo pago). */
export default function Checkout() {
  const { user, refreshBadges } = useSession();
  const cart = useData(() => api.cart(), []);
  const addresses = useData(() => api.addresses().then((r) => r.addresses), []);
  const [windowMin, setWindowMin] = React.useState(15);
  const [addressId, setAddressId] = React.useState<string | null>(null);
  const [phone, setPhone] = React.useState('');
  const [delivery, setDelivery] = React.useState<Record<string, 'envio' | 'retiro'>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { api.config().then((c) => setWindowMin(c.paymentWindows?.catalog || 15)).catch(() => {}); }, []);
  const list: any[] = addresses.data || [];
  const address = list.find((a) => a.id === addressId) || list.find((a) => a.isDefault) || list[0];
  React.useEffect(() => { if (!phone) setPhone(address?.phone || user?.phone || ''); }, [address?.id]);

  const groups: any[] = (cart.data?.groups || []).filter((g: any) => g.items.some((i: any) => !i.unavailable));
  const needsAddress = groups.some((g) => delivery[g.seller.id] !== 'retiro');

  const pickAddress = () => ActionSheetIOS.showActionSheetWithOptions(
    { title: 'Entregar en', options: [...list.map((a) => `${a.label} · ${a.street}`), 'Nueva dirección', 'Cancelar'], cancelButtonIndex: list.length + 1 },
    (i) => {
      if (i < list.length) setAddressId(list[i].id);
      else if (i === list.length) router.push('/direcciones/editar');
    }
  );
  const pickDelivery = (g: any) => ActionSheetIOS.showActionSheetWithOptions(
    { title: g.seller.name, options: ['Envío', 'Retiro en persona', 'Cancelar'], cancelButtonIndex: 2 },
    (i) => i < 2 && setDelivery((d) => ({ ...d, [g.seller.id]: i === 0 ? 'envio' : 'retiro' }))
  );

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const { paymentId } = await api.checkout({ addressId: needsAddress ? address?.id : undefined, phone, delivery });
      refreshBadges();
      router.replace(`/pago/${paymentId}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!cart.data || !addresses.data) return <View style={{ flex: 1, backgroundColor: C.groupedBg }}><NavBar title="Confirmar compra" /><Loading /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Confirmar compra" />
      <ScrollView contentContainerStyle={{ paddingBottom: 260 }} keyboardShouldPersistTaps="handled">
        <SectionHeader title="Entrega" style={{ paddingTop: 8 }} />
        <Group>
          {needsAddress && (address ? (
            <Row icon="mappin.and.ellipse" title={address.label} subtitle={[address.street, address.zone, address.city].filter(Boolean).join(', ')}
              right={<Text style={{ color: C.tintText, fontWeight: '600' }}>Cambiar</Text>} onPress={pickAddress} />
          ) : (
            <Row icon="plus.circle.fill" title="Agregar una dirección de entrega" chevron onPress={() => router.push('/direcciones/editar')} />
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52 }}>
            <Text style={T.body}>Teléfono</Text>
            <Text style={[T.body, { color: C.secondary }]}>+591</Text>
            <TextInput value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, ''))} keyboardType="phone-pad" maxLength={10}
              placeholder="7XXXXXXX" placeholderTextColor={C.tertiary} style={{ flex: 1, fontSize: 17, color: C.label }} accessibilityLabel="Teléfono de contacto" />
          </View>
        </Group>

        <SectionHeader title={`Tu pedido · ${groups.length} ${groups.length === 1 ? 'vendedor' : 'vendedores'}`} />
        <View style={{ gap: 12 }}>
          {groups.map((g) => {
            const items = g.items.filter((i: any) => !i.unavailable);
            const method = delivery[g.seller.id] || 'envio';
            return (
              <View key={g.seller.id} style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Avatar initials={g.seller.initials} bg={g.seller.color} size={28} />
                  <Text style={[T.headline, { flex: 1 }]} numberOfLines={1}>{g.seller.name}</Text>
                  <Text style={[T.headline, T.num]}>{bs(g.subtotal)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flexDirection: 'row' }}>
                    {items.slice(0, 3).map((i: any, n: number) => (
                      <Img key={i.variantId} url={i.photoUrl} color={i.color} radius={10} style={{ width: 44, height: 44, marginLeft: n ? -14 : 0, borderWidth: 2, borderColor: C.white }} />
                    ))}
                  </View>
                  <Text style={[T.footnote, { flex: 1 }]} numberOfLines={2}>{items.map((i: any) => `${i.qty} × ${i.title}`).join(', ')}</Text>
                </View>
                <Row title="Entrega" minHeight={40}
                  right={<Text style={{ color: g.allowsPickup ? C.tintText : C.secondary, fontWeight: '600' }}>{method === 'retiro' ? 'Retiro en persona' : g.shipping === 'Envío gratis' ? 'Envío gratis' : 'Envío a convenir'}</Text>}
                  onPress={g.allowsPickup ? () => pickDelivery(g) : undefined} />
              </View>
            );
          })}
        </View>

        <Notice tone="amber" icon="timer" style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 15, lineHeight: 20, color: '#6E330C' }}>
            Tenés <Text style={{ fontWeight: '700' }}>{windowMin} minutos</Text> para pagar y subir el comprobante. Mientras tanto te guardamos el stock.
          </Text>
        </Notice>
      </ScrollView>

      <BottomBar>
        <ErrorLine message={error || cart.error} />
        <TotalLine label="Total a pagar" value={cart.data.total} big />
        <Btn title={`Ir a pagar · ${bs(cart.data.total)}`} loading={busy} disabled={!groups.length || (needsAddress && !address) || phone.length < 8} onPress={pay} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, padding: 14, gap: 12 },
});
