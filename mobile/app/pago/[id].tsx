import React from 'react';
import { View, Text, ScrollView, Image, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { api, bs, clock, upload, realtime, type Upload } from '@/api';
import { useSession } from '@/session';
import { useData } from '@/hooks';
import { useCountdown } from '@/format';
import { pickFromLibrary, takePhoto, pickPdf } from '@/pickers';
import { SheetHeader, Btn, BottomBar, Notice, Press, Sym, Loading, ErrorLine, Group, Row, useToast } from '@/ui';
import { C, T, R, SOFT } from '@/theme';

/** D8 · Pago por QR de la plataforma (hoja completa). */
export default function Pago() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { refreshBadges } = useSession();
  const { data: p, error, reload } = useData(() => api.payment(id).then((r) => r.payment), [id]);
  const left = useCountdown(p?.expiresAt);
  const [file, setFile] = React.useState<Upload | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => realtime.on('payment:update', (x) => x?.payment?.id === id || x?.paymentId === id ? reload() : undefined), [id, reload]);
  // Ya estaba en revisión (p. ej. al reabrir desde un aviso): mostrar D8b.
  React.useEffect(() => { if (p?.status === 'in_review' || p?.status === 'approved') router.replace(`/pago/listo?id=${id}`); }, [p?.status, id]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!p) return <View style={{ flex: 1 }}><SheetHeader title="Pagá tu compra" onClose={close} />{error ? <View style={{ padding: 16 }}><ErrorLine message={error} /></View> : <Loading />}</View>;

  const expired = p.status === 'expired' || (p.expiresAt && left === 0 && p.status === 'pending');

  const copy = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.selectionAsync();
    toast(`${label} copiado`);
  };

  const saveQr = async () => {
    try {
      // Carga diferida: solo se necesitan al guardar el QR.
      const MediaLibrary = await import('expo-media-library');
      const { File, Paths } = await import('expo-file-system');
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) throw new Error('Sin permiso para guardar en tus fotos.');
      const f = await File.downloadFileAsync(p.qr.imageUrl, Paths.cache, { idempotent: true });
      await MediaLibrary.saveToLibraryAsync(f.uri);
      toast('QR guardado en Fotos');
    } catch (e: any) {
      setActionError(e.message || 'No pudimos guardar el QR.');
    }
  };

  const choose = async (how: 'library' | 'camera' | 'pdf') => {
    setActionError(null);
    try {
      const picked = how === 'library' ? (await pickFromLibrary())?.[0] : how === 'camera' ? await takePhoto() : await pickPdf();
      if (picked) setFile(picked);
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const send = async () => {
    if (!file) return;
    setBusy(true);
    setActionError(null);
    try {
      const { key } = await upload('receipts', file);
      await api.submitReceipt(id, key);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshBadges();
      router.replace(`/pago/listo?id=${id}`);
    } catch (e: any) {
      setActionError(e.message);
      if (e.status === 410) reload();
    } finally {
      setBusy(false);
    }
  };

  if (expired) {
    return (
      <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
        <SheetHeader title="El tiempo para pagar terminó" onClose={close} />
        <Notice tone="amber" icon="timer">El tiempo para pagar terminó. Liberamos el stock; podés volver a intentarlo.</Notice>
        <View style={{ padding: 16 }}><Btn title="Volver al carrito" onPress={() => router.replace('/carrito')} /></View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
        <SheetHeader
          eyebrow={`${p.orders.length} ${p.orders.length === 1 ? 'pedido' : 'pedidos'} · una transferencia`}
          title="Pagá tu compra" onClose={close} />

        {p.rejectReason && <Notice tone="red" icon="exclamationmark.triangle.fill" style={{ marginBottom: 10 }}>{`Revisamos tu comprobante: ${p.rejectReason}. Enviá uno nuevo.`}</Notice>}
        {p.expiresAt && (
          <Notice tone="amber" icon="timer">
            <Text style={[{ fontSize: 15, color: '#6E330C' }, T.num]}>Tenés <Text style={{ fontWeight: '700' }}>{clock(left)}</Text> para pagar y subir el comprobante.</Text>
          </Notice>
        )}

        {!p.qr ? (
          <Notice tone="red" style={{ marginTop: 12 }}>No pudimos cargar los datos de pago. Intentá de nuevo en unos minutos.</Notice>
        ) : (
          <View style={styles.qrCard}>
            <Image source={{ uri: p.qr.imageUrl }} style={{ width: 168, height: 168 }} resizeMode="contain" accessibilityLabel="Código QR de pago" />
            <Text style={T.headline}>{p.qr.platformName || p.qr.holder}</Text>
            <Text style={[T.footnote, T.num]}>{p.qr.bank} · {p.qr.account}</Text>
            <Btn title="Guardar QR en Fotos" tone="outlineTint" height={40} icon="square.and.arrow.down" onPress={saveQr} />
          </View>
        )}

        <Group style={{ marginTop: 12 }}>
          <View style={styles.copyRow}>
            <View style={{ flex: 1 }}>
              <Text style={T.section}>Monto exacto</Text>
              <Text style={[{ fontSize: 30, fontWeight: '700', color: C.tintText }, T.num]}>{bs(p.amount)}</Text>
            </View>
            <Btn title="Copiar" tone="tonal" height={36} icon="doc.on.doc" onPress={() => copy(String(p.amount), 'Monto')} />
          </View>
          <View style={styles.copyRow}>
            <View style={{ flex: 1 }}>
              <Text style={T.section}>Referencia</Text>
              <Text style={{ fontFamily: 'Menlo', fontSize: 20, fontWeight: '600', color: C.label }}>{p.ref}</Text>
              <Text style={T.footnote}>Escribilo en la glosa o el concepto de la transferencia.</Text>
            </View>
            <Btn title="Copiar" tone="tonal" height={36} icon="doc.on.doc" onPress={() => copy(p.ref, 'Referencia')} />
          </View>
        </Group>

        <Text style={[T.section, { paddingHorizontal: 32, paddingTop: 24, paddingBottom: 8 }]}>Comprobante</Text>
        {file ? (
          <Group>
            <Row icon={file.type === 'application/pdf' ? 'doc.fill' : 'photo.fill'} title={file.name} subtitle="Listo para enviar"
              right={<Press onPress={() => setFile(null)}><Text style={{ color: C.destructive, fontWeight: '600' }}>Quitar</Text></Press>} />
          </Group>
        ) : (
          <Group>
            <Row icon="photo.on.rectangle" title="Elegir de Fotos" chevron onPress={() => choose('library')} />
            <Row icon="camera" title="Sacar foto" chevron onPress={() => choose('camera')} />
            <Row icon="folder" title="Archivos (PDF)" chevron onPress={() => choose('pdf')} />
          </Group>
        )}

        {p.orders.length > 0 && (
          <>
            <Text style={[T.section, { paddingHorizontal: 32, paddingTop: 24, paddingBottom: 8 }]}>Incluye</Text>
            <Group>
              {p.orders.map((o: any) => (
                <Row key={o.id} title={o.seller} subtitle={o.ref} right={<Text style={[T.subhead, T.num]}>{bs(o.total)}</Text>} />
              ))}
            </Group>
          </>
        )}
      </ScrollView>

      <BottomBar>
        <ErrorLine message={actionError} />
        <Btn title="Ya pagué · Enviar comprobante" loading={busy} disabled={!file} onPress={send} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  qrCard: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, marginTop: 12, padding: 20, alignItems: 'center', gap: 8 },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
});
