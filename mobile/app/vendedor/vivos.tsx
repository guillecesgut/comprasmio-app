import React from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api';
import { useSession } from '@/session';
import { useData } from '@/hooks';
import { whenLabel, shortDate } from '@/format';
import { NavBar, Group, Row, Btn, Chip, Loading, EmptyCard, SectionHeader, ErrorLine, useToast } from '@/ui';
import { C, T, SOFT } from '@/theme';

/** Fecha y hora futuras a partir de "dd/mm hh:mm" (hora de Bolivia). */
function parseWhen(text: string) {
  const m = /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const now = new Date();
  let year = now.getUTCFullYear();
  const iso = (y: number) => `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${m[3].padStart(2, '0')}:${m[4]}:00-04:00`;
  let d = new Date(iso(year));
  if (d < now) d = new Date(iso(++year));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Mis vivos: en curso, programados (aparecen en D9, D15 y B1) e historial con su resumen (C7b). */
export default function MisVivos() {
  const toast = useToast();
  const { user } = useSession();
  const { data, reload } = useData(() => api.seller_.streams().then((r) => r.streams), []);
  const [error, setError] = React.useState<string | null>(null);
  const premium = user?.plan === 'premium';

  const schedule = () => Alert.prompt('Programar un vivo', 'Título del vivo', (title) => {
    if (!title?.trim()) return;
    Alert.prompt('¿Cuándo?', 'Día y hora, por ejemplo 7/11 19:30', async (when) => {
      const at = parseWhen(String(when || ''));
      if (!at) return setError('No entendimos la fecha. Usá día/mes hora:minutos, por ejemplo 7/11 19:30.');
      try {
        await api.seller_.scheduleStream(title.trim(), at.toISOString());
        toast('Vivo programado: tus seguidores lo ven en tu tienda');
        reload();
      } catch (e: any) { setError(e.message); }
    }, 'plain-text', '', 'numbers-and-punctuation');
  });

  const list: any[] = data || [];
  const live = list.filter((s) => s.status === 'live');
  const scheduled = list.filter((s) => s.status === 'scheduled');
  const ended = list.filter((s) => s.status === 'ended');

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Mis vivos" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ padding: 16, gap: 10 }}>
          <ErrorLine message={error} />
          {premium ? (
            <>
              <Btn title="Salir al aire" tone="bid" icon="video.fill" onPress={() => router.push('/transmitir/armar')} />
              <Btn title="Programar un vivo" tone="tonal" icon="calendar" onPress={schedule} />
            </>
          ) : <Btn title="Transmitir es parte de Premium" tone="tonal" icon="lock.fill" onPress={() => router.push('/plan/premium')} />}
        </View>
        {!data ? <Loading /> : !list.length ? (
          <EmptyCard title="Todavía no hiciste vivos" body="Cargá productos o paquetes, ordená la cola y salí al aire desde el botón Transmitir." />
        ) : (
          <>
            {live.length > 0 && (
              <>
                <SectionHeader title="Al aire" color={C.bidText} style={{ paddingTop: 4 }} />
                <Group>{live.map((s) => <Row key={s.id} icon="dot.radiowaves.left.and.right" iconColor={C.bid} title={s.title} subtitle="Volver a la transmisión" chevron onPress={() => router.push(`/transmitir/${s.id}`)} />)}</Group>
              </>
            )}
            {scheduled.length > 0 && (
              <>
                <SectionHeader title="Programados" />
                <Group>{scheduled.map((s) => <Row key={s.id} icon="calendar" title={s.title} subtitle={whenLabel(s.scheduledAt)} right={<Chip label="Programado" bg={SOFT.green.bg} fg={SOFT.green.fg} />} />)}</Group>
              </>
            )}
            {ended.length > 0 && (
              <>
                <SectionHeader title="Anteriores" />
                <Group>{ended.map((s) => (
                  <Row key={s.id} title={s.title} subtitle={`${shortDate(s.startedAt)} · ${s.peakViewers} espectadores máx.`} chevron onPress={() => router.push(`/transmitir/fin/${s.id}`)} />
                ))}</Group>
              </>
            )}
          </>
        )}
        <Text style={[T.footnote, { padding: 24, textAlign: 'center' }]}>Los vivos programados avisan a tus seguidores y aparecen en tu tienda.</Text>
      </ScrollView>
    </View>
  );
}
