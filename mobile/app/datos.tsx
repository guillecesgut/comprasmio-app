import React from 'react';
import { View, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api';
import { useSession } from '@/session';
import { NavBar, Group, Field, Btn, ErrorLine, SectionHeader, useToast } from '@/ui';
import { C, T } from '@/theme';

/** Datos personales: nombre, email y cambio de contraseña. El teléfono es el usuario y no se cambia. */
export default function Datos() {
  const { user, refreshUser } = useSession();
  const toast = useToast();
  const [name, setName] = React.useState(user?.name || '');
  const [email, setEmail] = React.useState(user?.email || '');
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [busy, setBusy] = React.useState<'data' | 'pass' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const saveData = async () => {
    setBusy('data');
    setError(null);
    try {
      await api.updateMe({ name: name.trim(), email: email.trim() || undefined });
      await refreshUser();
      toast('Datos guardados');
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  };
  const savePass = async () => {
    setBusy('pass');
    setError(null);
    try {
      await api.changePassword(current, next);
      setCurrent(''); setNext('');
      toast('Contraseña actualizada');
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Datos personales" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Group style={{ marginTop: 8 }}>
          <Field label="Nombre" value={name} onChangeText={setName} maxLength={60} />
          <Field label="Email (opcional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.secondary }}>Celular</Text>
            <Text style={[T.body, { color: C.secondary, marginTop: 4 }]}>+591 {user?.phone}</Text>
          </View>
        </Group>
        <View style={{ padding: 16 }}><Btn title="Guardar" loading={busy === 'data'} disabled={name.trim().length < 2} onPress={saveData} /></View>

        <SectionHeader title="Contraseña" style={{ paddingTop: 8 }} />
        <Group>
          <Field label="Contraseña actual" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
          <Field label="Contraseña nueva" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" hint="Al menos 6 caracteres." />
        </Group>
        <View style={{ padding: 16, gap: 8 }}>
          <ErrorLine message={error} />
          <Btn title="Cambiar contraseña" tone="tonal" loading={busy === 'pass'} disabled={!current || next.length < 6} onPress={savePass} />
          <Btn title="Volver" tone="plain" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </View>
  );
}
