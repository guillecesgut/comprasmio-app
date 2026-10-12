import { Redirect } from 'expo-router';
import { useSession } from '@/session';

/** Cada rol tiene su propia app: el vendedor nunca aterriza en el feed de compras. */
export default function Index() {
  const { user } = useSession();
  if (!user) return <Redirect href="/welcome" />;
  return <Redirect href={user.role === 'seller' ? '/resumen' : '/inicio'} />;
}
