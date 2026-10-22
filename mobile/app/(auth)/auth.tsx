import React from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, ScrollView, Platform, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/session';
import { Btn, Circle, Sym, ErrorLine } from '@/ui';
import { C, T, R } from '@/theme';

type Mode = 'signup' | 'login';

/**
 * A3 · Crear cuenta (viene de "Crear cuenta" → rol) o Iniciar sesión (viene de "Ya tengo
 * cuenta"). Cada camino muestra solo su formulario: quien eligió uno ya sabe si tiene cuenta.
 */
export default function Auth() {
  const params = useLocalSearchParams<{ mode?: Mode; role?: 'buyer' | 'seller'; phone?: string }>();
  const insets = useSafeAreaInsets();
  const session = useSession();

  const mode: Mode = params.mode === 'login' ? 'login' : 'signup';
  const role = params.role === 'seller' ? 'seller' : 'buyer';
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState(params.phone || '');
  // Solo si al crear la cuenta el número ya existe: atajo para iniciar sesión con ese número.
  const [exists, setExists] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const digits = phone.replace(/\D/g, '');
  const valid =
    digits.length >= 8 && password.length >= 6 && (mode === 'login' || name.trim().length >= 2);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setExists(false);
    try {
      if (mode === 'signup') await session.signup({ name: name.trim(), phone: digits, password, role });
      else await session.login(digits, password);
      router.replace('/');
    } catch (e: any) {
      setError(e.message);
      if (mode === 'signup' && e.status === 409) setExists(true);
    } finally {
      setBusy(false);
    }
  };

  const seller = role === 'seller';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.groupedBg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }}>
          <Circle icon="chevron.backward" onPress={() => router.back()} label="Volver" />
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: 16 }}>
          <Text style={T.title1}>{mode === 'signup' ? 'Creá tu cuenta' : 'Hola de nuevo'}</Text>
          {mode === 'signup' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <Sym name={seller ? 'video.fill' : 'bag.fill'} size={15} color={seller ? C.bid : C.tint} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: seller ? C.bidText : C.tintText }}>
                Cuenta de {seller ? 'vendedor' : 'comprador'}
              </Text>
            </View>
          )}
        </View>

        <View style={{ backgroundColor: C.surface, borderRadius: R.authCard, marginHorizontal: 16, overflow: 'hidden' }}>
          {mode === 'signup' && (
            <Field label="Nombre">
              <TextInput
                value={name} onChangeText={setName} placeholder="Ana Quispe" placeholderTextColor={C.tertiary}
                textContentType="name" autoComplete="name" autoCapitalize="words" style={styles.input} returnKeyType="next"
              />
            </Field>
          )}
          <Field label="Celular" divider={mode === 'signup'}>
            <Text style={[T.body, { color: C.secondary, marginRight: 6 }]}>+591</Text>
            <TextInput
              value={phone} onChangeText={setPhone} placeholder="71234567" placeholderTextColor={C.tertiary}
              keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" style={styles.input} maxLength={12}
            />
          </Field>
          <Field label="Contraseña" divider>
            <TextInput
              value={password} onChangeText={setPassword} secureTextEntry
              placeholder={mode === 'signup' ? 'Mínimo 6 caracteres' : ''} placeholderTextColor={C.tertiary}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              style={styles.input} returnKeyType="go" onSubmitEditing={() => valid && submit()}
            />
          </Field>
        </View>

        <View style={{ paddingHorizontal: 32 }}>
          <ErrorLine message={error} />
          {exists && (
            <Btn title="Iniciar sesión con este número" tone="tonal" height={44} style={{ marginTop: 12 }}
              onPress={() => router.replace({ pathname: '/auth', params: { mode: 'login', phone: digits } })} />
          )}
          {mode === 'signup' && (
            <Text style={[T.footnote, { marginTop: 10 }]}>Te mandamos los avisos de tus pujas y pagos a este número.</Text>
          )}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 16) + 8, paddingTop: 8 }}>
        <Btn
          title={mode === 'signup' ? 'Crear cuenta' : 'Entrar'}
          tone={mode === 'signup' && seller ? 'bid' : 'tint'}
          disabled={!valid}
          loading={busy}
          onPress={submit}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, divider, children }: { label: string; divider?: boolean; children: React.ReactNode }) {
  return (
    <>
      {divider && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.rowSeparator, marginLeft: 16 }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 16 }}>
        <Text style={[T.body, { width: 104 }]}>{label}</Text>
        {children}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  input: { flex: 1, fontSize: 17, color: C.label, paddingVertical: 14 },
});
