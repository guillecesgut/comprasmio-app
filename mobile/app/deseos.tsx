import React from 'react';
import { View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api';
import { useData, useToggleFav } from '@/hooks';
import { NavBar, ProductGrid, Loading, EmptyCard, Btn, ErrorLine } from '@/ui';
import { C } from '@/theme';

/** D14 · Lista de deseos: tocar el corazón la quita (y se puede volver a guardar desde el producto). */
export default function Deseos() {
  const { data, error, setData } = useData(() => api.wishlist().then((r) => r.items), []);
  const toggle = useToggleFav(React.useCallback((id: string, fav: boolean) => {
    setData((l: any) => (fav ? l : (l || []).filter((p: any) => p.id !== id)));
  }, [setData]));

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title="Lista de deseos" />
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
        <ErrorLine message={error} />
        {!data ? <Loading /> : data.length ? <ProductGrid products={data} onToggleFav={toggle} /> : (
          <EmptyCard title="Tu lista está vacía" body="Guardá productos con el corazón para verlos acá."
            action={<Btn title="Explorar" onPress={() => router.navigate('/inicio')} />} />
        )}
      </ScrollView>
    </View>
  );
}
