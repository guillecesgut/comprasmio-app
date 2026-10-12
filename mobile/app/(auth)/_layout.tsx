import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/session';
import { C } from '@/theme';

export default function AuthLayout() {
  const { user } = useSession();
  if (user) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.white } }} />;
}
