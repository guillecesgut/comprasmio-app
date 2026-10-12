import React from 'react';
import { View, Text, Image, ScrollView, ActionSheetIOS, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as MediaLibrary from 'expo-media-library';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, bs, clock, type Upload } from '@/api';
import { SheetHeader, Group, Row, SectionHeader, Btn, Sym, ErrorLine, useToast } from '@/ui';
import { useCountdown } from '@/format';
import { C, T, R } from '@/theme';

/**
 * B5 · Pago por QR. Único método de pago: el comprador guarda el QR, paga desde
 * la app de su banco y adjunta el comprobante. Al confirmar se abre el chat
 * con el vendedor, que ya trae su primer mensaje escrito por el servidor.
 */
export default function Pago() {
  const { orderId = '', ganaste } = useLocalSearchParams<{ orderId: string; ganaste?: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [order, setOrder] = React.useState<any>(null);
  const [payment, setPayment] = React.useState<any>(null);
  const [receipt, setReceipt] = React.useState<Upload | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const left = useCountdown(order?.createdAt);

  React.useEffect(() => {
    api.order(orderId).then(({ order }) => setOrder(order)).catch((e) => setError(e.message));
    api.paymentQr(orderId).then(setPayment).catch((e) => setError(e.message));
  }, [orderId]);

  /** Escribe el PNG base64 a un archivo y lo guarda en Fotos (Safari no podía). */
  const saveQr = async () => {
    if (!payment) return;
    try {
      const { granted } = await MediaLibrary.requestPermissionsAsync(true);
      if (!granted) return setError('Sin permiso para guardar en Fotos. Habilitalo en Ajustes → ComprasMío!.');
      const file = new File(Paths.cache, `qr-${String(payment.ref).replace('#', '')}.png`);
      if (file.exists) file.delete();
      file.create();
      const base64 = String(payment.qr).split(',')[1];
      file.write(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
      await MediaLibrary.saveToLibraryAsync(file.uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast('QR guardado en Fotos');
    } catch {
      setError('No pudimos guardar el QR. Hacé una captura de pantalla.');
    }
  };

  const pickPhoto = async (camera: boolean) => {
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError('Necesitamos permiso para adjuntar el comprobante.');
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
    const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const asset = result.assets[0];
    // quality < 1 hace que iOS exporte JPEG (el servidor no siempre acepta HEIC).
    setReceipt({ uri: asset.uri, name: asset.fileName?.replace(/\.heic$/i, '.jpg') || `comprobante-${Date.now()}.jpg`, type: 'image/jpeg' });
    setError(null);
  };

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    setReceipt({ uri: asset.uri, name: asset.name, type: 'application/pdf' });
    setError(null);
  };

  const change = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Elegir de Fotos', 'Sacar foto', 'Archivos (PDF)', 'Cancelar'], cancelButtonIndex: 3 },
      (i) => (i === 0 ? pickPhoto(false) : i === 1 ? pickPhoto(true) : i === 2 ? pickPdf() : undefined)
    );

  const confirm = async () => {
    if (!receipt || !order) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadReceipt(order.id, receipt);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismiss();
      router.push(`/mensajes/${order.sellerId}?orden=${order.id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    if (!receipt) return router.back();
    Alert.alert('¿Salir sin confirmar?', 'Tu comprobante todavía no se envió.', [
      { text: 'Seguir acá', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const won = ganaste === '1' || order?.mode === 'auction';
  const total = order?.total ?? payment?.total ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <SheetHeader
          eyebrow={won ? '¡Ganaste el lote!' : 'Compra reservada'}
          eyebrowIcon={won ? 'trophy.fill' : 'checkmark.circle.fill'}
          title="Pagá tu compra"
          onClose={close}
        />

        {order?.status === 'pendiente_pago' && (
          <View style={{ flexDirection: 'row', gap: 10, backgroundColor: '#FBE9DC', borderRadius: 20, marginHorizontal: 16, padding: 14, alignItems: 'center' }}>
            <Sym name="timer" size={22} color={C.bidText} />
            <Text style={[{ flex: 1, fontSize: 15, color: C.bidText }, T.num]}>
              {left > 0 ? <>Tenés <Text style={{ fontWeight: '700' }}>{clock(left)}</Text> para pagar. </> : 'Se venció el tiempo para pagar. '}
              Si no, el lote puede volver a subasta.
            </Text>
          </View>
        )}

        <Group style={{ marginTop: 12 }}>
          <Row
            title={<Text numberOfLines={1} style={[T.body, { color: C.secondary }]}>{order?.productName || '…'}</Text>}
            right={<Text style={[T.body, T.num, { fontWeight: '600' }]}>{bs(order?.amount ?? 0)}</Text>}
          />
          <Row
            title={<Text style={[T.body, { color: C.secondary }]}>Envío</Text>}
            right={<Text style={[T.body, { color: order?.shippingMode === 'free' ? C.tintText : C.label }]}>{order?.shippingMode === 'free' ? 'Envío gratis' : 'A convenir'}</Text>}
          />
          <Row
            minHeight={64}
            title={<Text style={[T.body, { fontWeight: '600' }]}>Total</Text>}
            right={<Text style={[{ fontSize: 24, fontWeight: '700', color: C.tintText }, T.num]}>{bs(total)}</Text>}
          />
        </Group>

        <View style={{ backgroundColor: C.surface, borderRadius: R.card, marginHorizontal: 16, marginTop: 12, padding: 14, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <View style={{ width: 128, height: 128, borderRadius: 14, borderWidth: 1, borderColor: C.separator, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFDFA' }}>
            {payment
              ? <Image source={{ uri: payment.qr }} style={{ width: 116, height: 116 }} accessibilityLabel="Código QR para pagar" />
              : <Text style={T.footnote}>Generando…</Text>}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[T.headline]} numberOfLines={1}>{payment?.bank || ' '}</Text>
            <Text style={[T.subhead, { color: C.secondary }]} numberOfLines={1}>{payment?.holder}</Text>
            <Text style={[T.footnote, T.num]} numberOfLines={1}>{payment?.account} · {payment?.ref}</Text>
            <Btn title="Guardar en Fotos" icon="arrow.down.to.line" tone="outlineTint" height={40} onPress={saveQr} disabled={!payment} style={{ marginTop: 10, paddingHorizontal: 12 }} />
          </View>
        </View>

        <SectionHeader title="Comprobante" />
        {receipt ? (
          <View style={{ backgroundColor: '#E4F0EA', borderRadius: R.card, marginHorizontal: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {receipt.type.startsWith('image/')
              ? <Image source={{ uri: receipt.uri }} style={{ width: 48, height: 48, borderRadius: 10 }} />
              : <Sym name="doc.text" size={30} color={C.tint} />}
            <View style={{ flex: 1 }}>
              <Text style={[T.callout, { fontWeight: '600', color: C.tintText }]}>Comprobante listo</Text>
              <Text style={T.footnote} numberOfLines={1}>{receipt.name}</Text>
            </View>
            <Btn title="Cambiar" tone="plain" height={36} onPress={change} textStyle={{ color: C.tintText }} />
          </View>
        ) : (
          <Group inset={50}>
            <Row icon="photo.on.rectangle" title="Elegir de Fotos" chevron onPress={() => pickPhoto(false)} />
            <Row icon="camera" title="Sacar foto" chevron onPress={() => pickPhoto(true)} />
            <Row icon="folder" title="Archivos (PDF)" chevron onPress={pickPdf} />
          </Group>
        )}

        <View style={{ paddingHorizontal: 32 }}><ErrorLine message={error} /></View>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 4, borderTopWidth: 0.5, borderTopColor: C.separator }}>
        <Btn title={`Confirmar pago · ${bs(total)}`} disabled={!receipt || order?.status !== 'pendiente_pago'} loading={busy} onPress={confirm} />
      </View>
    </View>
  );
}
