import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { api, bs } from '@/api';
import { useSession } from '@/session';
import { useData } from '@/hooks';
import { shortDate } from '@/format';
import { NavBar, Chip, Btn, Notice, Loading, ErrorLine, SectionHeader } from '@/ui';
import { C, T, R, SOFT } from '@/theme';

/** E11 · Mi plan: plan actual, comparación Básico | Premium y cómo pasar a Premium (pago por QR, sin compra in-app). */
export default function MiPlan() {
  const { refreshUser } = useSession();
  const { data: p, error, reload } = useData(() => api.seller_.plan().then((r) => r.plan), [], { events: ['payment:update'] });
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  React.useEffect(() => { if (p) refreshUser().catch(() => {}); }, [p?.plan]);

  if (!p) return <View style={{ flex: 1, backgroundColor: C.groupedBg }}><NavBar title="Mi plan" />{error ? <ErrorLine message={error} /> : <Loading />}</View>;
  const premium = p.plan === 'premium';

  const pay = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const { paymentId } = await api.seller_.requestPremium();
      router.push(`/pago/${paymentId}`);
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy(false);
      reload();
    }
  };

  const rows: [string, string, string][] = [
    ['Catálogo en el marketplace', '✓', '✓'],
    ['Comisión por venta', `${p.basicoPct} %`, `${p.premiumPct} %`],
    ['Transmisiones en vivo', '—', '✓'],
    ['Subastas y paquetes', '—', '✓'],
    ['Precio', 'Sin costo fijo', `${bs(p.premiumPrice)} / ${p.premiumDays} días`],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Mi plan" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.card}>
          <Chip label={premium ? 'Premium' : 'Básico'} bg={premium ? C.bid : C.fill2} fg={premium ? C.white : '#4C463C'} />
          <Text style={[T.title1, { marginTop: 6 }]}>{premium ? 'Plan Premium' : 'Plan Básico'}</Text>
          <Text style={[T.subhead, { color: C.secondary }]}>
            {premium ? `Activo hasta el ${shortDate(p.until)} · comisión ${p.commissionPct} %` : `Comisión ${p.commissionPct} % · Catálogo en el marketplace, sin vivos`}
          </Text>
          {p.expired && <Text style={[T.footnote, { color: C.destructive }]}>Tu Premium venció: los vivos quedaron bloqueados; el catálogo sigue con la comisión Básica.</Text>}
        </View>

        {p.pendingPayment && (
          <Notice tone="green" icon="hourglass" style={{ marginTop: 12 }}>
            {p.pendingPayment.status === 'in_review' ? `Pago de plan en revisión (${p.pendingPayment.ref}). Te avisamos cuando se active.` : `Tenés un pago de plan pendiente (${p.pendingPayment.ref}).`}
          </Notice>
        )}
        {premium && p.expiringSoon && <Notice tone="amber" icon="timer" style={{ marginTop: 12 }}>{`Tu Premium vence en ${p.daysLeft} ${p.daysLeft === 1 ? 'día' : 'días'}. Renovalo para no cortar tus vivos.`}</Notice>}
        {!premium && p.estimatedSaving > 0 && (
          <Notice tone="green" icon="chart.line.uptrend.xyaxis" style={{ marginTop: 12 }}>
            {`Con tus ventas del último mes (${bs(p.lastMonthSales)}) habrías ahorrado ${bs(p.estimatedSaving)} en comisiones con Premium, ya descontado el precio del plan.`}
          </Notice>
        )}

        <SectionHeader title="Comparación" />
        <View style={[styles.card, { padding: 0 }]}>
          <View style={[styles.tr, { borderTopWidth: 0 }]}>
            <Text style={[styles.td, { flex: 1.6 }]} />
            <Text style={[styles.th]}>Básico</Text>
            <Text style={[styles.th, { color: C.bidText }]}>Premium</Text>
          </View>
          {rows.map(([label, a, b]) => (
            <View key={label} style={styles.tr}>
              <Text style={[styles.td, { flex: 1.6 }]}>{label}</Text>
              <Text style={[styles.td, styles.center]}>{a}</Text>
              <Text style={[styles.td, styles.center, { fontWeight: '600' }]}>{b}</Text>
            </View>
          ))}
        </View>

        {(!premium || p.expiringSoon) && !(p.pendingPayment?.status === 'in_review') && (
          <>
            <SectionHeader title={premium ? 'Cómo renovar' : 'Cómo pasar a Premium'} />
            <View style={[styles.card, { gap: 12 }]}>
              <Step n={1} text={`Transferí ${bs(p.premiumPrice)} al QR de ComprasMío! con la referencia PREMIUM-<TU TIENDA> que te damos.`} />
              <Step n={2} text="Subí el comprobante. Cuando lo verificamos, se activa por " extra={`${p.premiumDays} días.`} />
              <Text style={T.footnote}>Se paga por QR: no es una compra dentro de la app.</Text>
              <ErrorLine message={actionError} />
              <Btn title={p.pendingPayment ? 'Continuar con el pago' : premium ? `Renovar · ${bs(p.premiumPrice)}` : `Pasar a Premium · ${bs(p.premiumPrice)}`} tone="bid" loading={busy} onPress={pay} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const Step = ({ n, text, extra }: { n: number; text: string; extra?: string }) => (
  <View style={{ flexDirection: 'row', gap: 10 }}>
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: SOFT.amber.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.bidText, fontWeight: '700' }}>{n}</Text>
    </View>
    <Text style={[T.subhead, { flex: 1 }]}>{text}{extra}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: R.card, marginHorizontal: 16, padding: 18, gap: 4, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.rowSeparator, paddingHorizontal: 14, paddingVertical: 12 },
  th: { flex: 1, textAlign: 'center', fontWeight: '700', fontSize: 14, color: C.label },
  td: { flex: 1, fontSize: 14, color: C.label },
  center: { textAlign: 'center' },
});

