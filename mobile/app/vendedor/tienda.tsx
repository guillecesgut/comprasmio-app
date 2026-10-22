import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { api, upload, type Upload } from '@/api';
import { useSession } from '@/session';
import { useData } from '@/hooks';
import { pickFromLibrary } from '@/pickers';
import { NavBar, Group, Row, Field, Btn, Img, Avatar, Sym, SwitchRow, ErrorLine, Loading, SectionHeader, useToast } from '@/ui';
import { C, T } from '@/theme';

/** E10 · Mi tienda: portada, avatar, datos, redes, link y entrega por defecto (se hereda en E2). */
export default function MiTienda() {
  const toast = useToast();
  const { refreshUser } = useSession();
  const { data: store } = useData(() => api.seller_.store().then((r) => r.store), []);
  const [form, setForm] = React.useState<any>(null);
  const [cover, setCover] = React.useState<Upload | null>(null);
  const [avatar, setAvatar] = React.useState<Upload | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (store && !form) setForm({
      name: store.name, bio: store.bio || '', city: store.city || '',
      tiktok: store.socials?.tiktok || '', instagram: store.socials?.instagram || '', whatsapp: store.socials?.whatsapp || '',
      delivery: store.deliveryOptions || ['envio_gratis'],
    });
  }, [store, form]);

  if (!store || !form) return <View style={{ flex: 1, backgroundColor: C.groupedBg }}><NavBar title="Mi tienda" /><Loading /></View>;
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const toggleDelivery = (k: string) => set('delivery', form.delivery.includes(k) ? form.delivery.filter((x: string) => x !== k) : [...form.delivery, k]);
  const choose = async (setter: (u: Upload) => void) => {
    try { const r = await pickFromLibrary(); if (r) setter(r[0]); } catch (e: any) { setError(e.message); }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const coverKey = cover ? (await upload('covers', cover)).key : undefined;
      const avatarKey = avatar ? (await upload('avatars', avatar)).key : undefined;
      await api.seller_.saveStore({
        name: form.name, bio: form.bio, city: form.city, deliveryOptions: form.delivery,
        socials: { tiktok: form.tiktok, instagram: form.instagram, whatsapp: form.whatsapp }, coverKey, avatarKey,
      });
      await refreshUser().catch(() => {});
      toast('Tienda guardada');
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Mi tienda" right={<Pressable onPress={() => router.push({ pathname: '/tienda/[slug]', params: { slug: store.slug, preview: '1' } })}><Text style={{ color: C.tintText, fontWeight: '600' }}>Ver</Text></Pressable>} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => choose(setCover)} accessibilityLabel="Cambiar portada">
          <Img url={cover?.uri || store.coverUrl} color={store.color} radius={22} style={{ height: 150, marginHorizontal: 16 }}>
            <View style={{ position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(0,0,0,.45)', borderRadius: 999, paddingHorizontal: 12, height: 30, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Sym name="camera" size={14} color={C.white} /><Text style={{ color: C.white, fontWeight: '600' }}>Portada</Text>
            </View>
          </Img>
        </Pressable>
        <Pressable onPress={() => choose(setAvatar)} style={{ alignSelf: 'flex-start', marginLeft: 32, marginTop: -36, borderWidth: 4, borderColor: C.groupedBg, borderRadius: 40 }} accessibilityLabel="Cambiar avatar">
          {avatar?.uri || store.avatarUrl ? <Img url={avatar?.uri || store.avatarUrl} radius={36} style={{ width: 72, height: 72 }} /> : <Avatar initials={store.initials} bg={store.color} size={72} />}
        </Pressable>

        <Group style={{ marginTop: 12 }}>
          <Field label="Nombre de la tienda" value={form.name} onChangeText={(v) => set('name', v)} maxLength={60} />
          <Field label="Ciudad" value={form.city} onChangeText={(v) => set('city', v)} maxLength={40} />
          <Field label="Descripción" value={form.bio} onChangeText={(v) => set('bio', v)} multiline maxLength={500} placeholder="Qué vendés, desde cuándo, envíos…" />
        </Group>

        <SectionHeader title="Redes" />
        <Group>
          <Field label="TikTok" value={form.tiktok} onChangeText={(v) => set('tiktok', v)} autoCapitalize="none" placeholder="@tutienda" />
          <Field label="Instagram" value={form.instagram} onChangeText={(v) => set('instagram', v)} autoCapitalize="none" placeholder="@tutienda" />
          <Field label="WhatsApp" value={form.whatsapp} onChangeText={(v) => set('whatsapp', v)} keyboardType="phone-pad" placeholder="+591 7…" />
        </Group>

        <SectionHeader title="Entrega por defecto" />
        <Group>
          <SwitchRow title="Envío gratis" value={form.delivery.includes('envio_gratis')} onChange={() => toggleDelivery('envio_gratis')} />
          <SwitchRow title="Envío a convenir" value={form.delivery.includes('a_convenir')} onChange={() => toggleDelivery('a_convenir')} />
          <SwitchRow title="Retiro en persona" value={form.delivery.includes('retiro')} onChange={() => toggleDelivery('retiro')} />
        </Group>

        <SectionHeader title="Link de tu tienda" />
        <Group>
          <Row icon="link" title={store.link} right={<Pressable onPress={async () => { await Clipboard.setStringAsync(`https://${store.link}`); toast('Link copiado'); }}>
            <Text style={{ color: C.tintText, fontWeight: '600' }}>Copiar</Text></Pressable>} />
        </Group>

        <View style={{ padding: 16, gap: 8 }}>
          <ErrorLine message={error} />
          <Btn title="Guardar" loading={busy} disabled={form.name.trim().length < 2 || !form.delivery.length} onPress={save} />
          <Text style={[T.footnote, { textAlign: 'center' }]}>Las opciones de entrega se usan al crear productos nuevos.</Text>
        </View>
      </ScrollView>
    </View>
  );
}
