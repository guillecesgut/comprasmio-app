import React from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useSession } from '@/session';
import { NavBar, Group, Field, Btn, ErrorLine, Notice } from '@/ui';
import { C, T } from '@/theme';

/** Borrar cuenta (requisito de Apple). El servidor no lo permite con pedidos o cobros abiertos. */
export default function BorrarCuenta() {
  const { deleteAccount, user } = useSession();
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const confirm = () => Alert.alert('¿Borrar tu cuenta?', 'No se puede deshacer. Se borran tus datos personales; los pedidos quedan registrados de forma anónima.', [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: 'Borrar cuenta', style: 'destructive', onPress: async () => {
        setBusy(true);
        setError(null);
        try { await deleteAccount(password); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
      },
    },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Borrar cuenta" />
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Notice tone="red" icon="exclamationmark.triangle.fill">
          {user?.role === 'seller'
            ? 'Se cierra tu tienda y se borran tus productos. No podés borrarla si tenés pedidos en curso o un pago programado.'
            : 'No podés borrar la cuenta si tenés pedidos en curso. Esperá a que se entreguen o resuelvan.'}
        </Notice>
        <Group style={{ marginTop: 16 }}>
          <Field label="Tu contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
        </Group>
        <View style={{ padding: 16, gap: 8 }}>
          <ErrorLine message={error} />
          <Btn title="Borrar mi cuenta" tone="destructive" loading={busy} disabled={!password} onPress={confirm} />
          <Text style={[T.footnote, { textAlign: 'center' }]}>Si tenés dudas, escribinos antes desde Ayuda.</Text>
        </View>
      </ScrollView>
    </View>
  );
}
