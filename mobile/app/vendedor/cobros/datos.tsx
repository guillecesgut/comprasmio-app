import React from 'react';
import { View, Text, ScrollView, ActionSheetIOS, Pressable } from 'react-native';
import { router } from 'expo-router';
import { api, upload, type Upload } from '@/api';
import { useData } from '@/hooks';
import { pickFromLibrary } from '@/pickers';
import { NavBar, Group, Row, Field, Btn, Chip, Notice, ErrorLine, Img, Loading, SectionHeader, Sym, useToast } from '@/ui';
import { C, T, SOFT } from '@/theme';

const BANKS = ['Banco Unión', 'Banco Mercantil Santa Cruz', 'Banco Nacional de Bolivia (BNB)', 'Banco de Crédito (BCP)', 'Banco Bisa',
  'Banco Ganadero', 'Banco Económico', 'Banco Sol', 'Banco FIE', 'Banco Pyme Los Andes', 'Banco Prodem', 'Banco Fortaleza', 'Otro'];
const TYPES = ['Caja de ahorro', 'Cuenta corriente'];
const STATUS: Record<string, [string, string, string]> = {
  verified: ['Verificados', SOFT.green.bg, SOFT.green.fg], pending: ['En revisión', SOFT.amber.bg, SOFT.amber.fg], rejected: ['Rechazados', SOFT.red.bg, SOFT.red.fg],
};

/** E8 · Datos para cobrar. Se revisan antes del primer pago; si cambian, vuelven a revisión. */
export default function DatosCobro() {
  const toast = useToast();
  const { data, loading } = useData(() => api.seller_.payoutAccount().then((r) => r.account), []);
  const [form, setForm] = React.useState({ bank: '', accountType: '', accountNumber: '', holder: '', holderDoc: '' });
  const [qr, setQr] = React.useState<{ file?: Upload; url?: string | null }>({});
  const [otherBank, setOtherBank] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    if (!data) return;
    setForm({ bank: data.bank, accountType: data.accountType, accountNumber: data.accountNumber, holder: data.holder, holderDoc: data.holderDoc });
    setOtherBank(!BANKS.includes(data.bank));
    setQr({ url: data.qrUrl });
  }, [data]);

  const pick = (title: string, options: string[], onPick: (v: string) => void) =>
    ActionSheetIOS.showActionSheetWithOptions({ title, options: [...options, 'Cancelar'], cancelButtonIndex: options.length }, (i) => i < options.length && onPick(options[i]));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const qrKey = qr.file ? (await upload('payout-accounts', qr.file)).key : undefined;
      await api.seller_.savePayoutAccount({ ...form, qrKey });
      toast('Datos enviados a revisión');
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const status = data ? STATUS[data.status] : null;
  const ok = Object.values(form).every((v) => v.trim());

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Datos para cobrar" />
      {loading && !data ? <Loading /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {status && <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}><Chip label={status[0]} bg={status[1]} fg={status[2]} /></View>}
          {data?.rejectReason && data.status === 'rejected' && <Notice tone="red" style={{ marginBottom: 8 }}>{`Motivo: ${data.rejectReason}`}</Notice>}

          <SectionHeader title="Cuenta bancaria" style={{ paddingTop: 8 }} />
          <Group>
            {otherBank ? <Field label="Banco" value={form.bank} onChangeText={(v) => set('bank', v)} placeholder="Nombre del banco" /> : (
              <Row title="Banco" onPress={() => pick('Banco', BANKS, (v) => (v === 'Otro' ? (setOtherBank(true), set('bank', '')) : set('bank', v)))}
                right={<Picked value={form.bank} />} />
            )}
            <Row title="Tipo" onPress={() => pick('Tipo de cuenta', TYPES, (v) => set('accountType', v))} right={<Picked value={form.accountType} />} />
            <Field label="Número de cuenta" value={form.accountNumber} onChangeText={(v) => set('accountNumber', v)} keyboardType="number-pad" />
            <Field label="Titular" value={form.holder} onChangeText={(v) => set('holder', v)} placeholder="Como figura en el banco" />
            <Field label="CI o NIT del titular" value={form.holderDoc} onChangeText={(v) => set('holderDoc', v)} keyboardType="numbers-and-punctuation" />
          </Group>

          <SectionHeader title="QR personal (opcional)" />
          <Group>
            <Row icon="qrcode" title={qr.file || qr.url ? 'Cambiar QR' : 'Subir el QR de tu banco'} onPress={async () => {
              try { const r = await pickFromLibrary(); if (r) setQr({ file: r[0], url: r[0].uri }); } catch (e: any) { setError(e.message); }
            }} right={qr.url ? <Img url={qr.url} radius={8} style={{ width: 44, height: 44 }} /> : undefined} />
          </Group>

          <Notice tone="gray" icon="info.circle" style={{ marginTop: 16 }}>
            Revisamos estos datos antes del primer pago. El titular tiene que coincidir con el CI o NIT. Si los cambiás, el próximo pago puede demorar.
          </Notice>
          <View style={{ padding: 16, gap: 8 }}>
            <ErrorLine message={error} />
            <Btn title="Guardar y enviar a revisión" disabled={!ok} loading={busy} onPress={save} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const Picked = ({ value }: { value: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220 }}>
    <Text numberOfLines={1} style={[T.body, { color: value ? C.label : C.tertiary }]}>{value || 'Elegí'}</Text>
    <Sym name="chevron.up.chevron.down" size={13} color={C.tertiary} />
  </View>
);
