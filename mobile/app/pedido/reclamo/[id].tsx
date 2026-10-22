import React from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, bs, upload, type Upload } from '@/api';
import { useSession } from '@/session';
import { useData } from '@/hooks';
import { pickFromLibrary } from '@/pickers';
import { SheetHeader, Btn, Group, Row, Sym, Notice, Img, ErrorLine, useToast } from '@/ui';
import { C, T } from '@/theme';

const REASONS = [
  { key: 'no_llego', label: 'No llegó' }, { key: 'danado', label: 'Llegó dañado' },
  { key: 'no_es_lo_que_compre', label: 'No es lo que compré' }, { key: 'otro', label: 'Otro' },
];

/** D13 · Reportar un problema: el pago al vendedor queda retenido mientras se revisa. */
export default function Reclamo() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { refreshBadges } = useSession();
  const { data: o } = useData(() => api.order(id).then((r) => r.order), [id]);
  const [reason, setReason] = React.useState<string | null>(null);
  const [description, setDescription] = React.useState('');
  const [photos, setPhotos] = React.useState<Upload[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const addPhotos = async () => {
    try {
      const r = await pickFromLibrary({ multiple: 4 - photos.length });
      if (r) setPhotos((p) => [...p, ...r].slice(0, 4));
    } catch (e: any) { setError(e.message); }
  };

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const photoKeys = [];
      for (const p of photos) photoKeys.push((await upload('claims', p)).key);
      await api.openClaim(id, { reason, description: description.trim() || undefined, photoKeys });
      refreshBadges();
      toast('Recibimos tu reclamo');
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.groupedBg }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <SheetHeader title="Reportar un problema" onClose={() => router.back()} />
      {o && (
        <Group>
          <Row left={<Img url={o.photoUrl} color={o.color} radius={12} style={{ width: 48, height: 48 }} />} title={o.title}
            subtitle={`${o.ref} · ${o.seller.name} · ${bs(o.total)}`} />
        </Group>
      )}
      <Text style={[T.section, { paddingHorizontal: 32, paddingTop: 20, paddingBottom: 8 }]}>¿Qué pasó?</Text>
      <Group>
        {REASONS.map((r) => (
          <Row key={r.key} title={r.label} onPress={() => setReason(r.key)}
            right={<Sym name={reason === r.key ? 'checkmark.circle.fill' : 'circle'} size={22} color={reason === r.key ? C.tint : C.unchecked} />} />
        ))}
      </Group>
      <Text style={[T.section, { paddingHorizontal: 32, paddingTop: 20, paddingBottom: 8 }]}>Contanos más</Text>
      <Group>
        <TextInput value={description} onChangeText={setDescription} multiline maxLength={1000} placeholder="Qué recibiste, cuándo, qué esperabas…"
          placeholderTextColor={C.tertiary} style={{ minHeight: 100, padding: 16, fontSize: 16, color: C.label, textAlignVertical: 'top' }} />
        <View style={{ flexDirection: 'row', gap: 8, padding: 12, flexWrap: 'wrap' }}>
          {photos.map((p, i) => (
            <Pressable key={i} onPress={() => setPhotos((l) => l.filter((_, n) => n !== i))} accessibilityLabel="Quitar foto">
              <Img url={p.uri} radius={10} style={{ width: 64, height: 64 }} />
            </Pressable>
          ))}
          {photos.length < 4 && (
            <Pressable onPress={addPhotos} style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: C.fill2, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Agregar fotos">
              <Sym name="camera" size={22} color={C.secondary} />
            </Pressable>
          )}
        </View>
      </Group>
      <Notice tone="gray" icon="lock.fill" style={{ marginTop: 16 }}>Mientras revisamos tu caso, el pago a este vendedor queda retenido.</Notice>
      <View style={{ padding: 16, gap: 8 }}>
        <ErrorLine message={error} />
        <Btn title="Enviar reclamo" disabled={!reason} loading={busy} onPress={send} />
      </View>
    </ScrollView>
  );
}
