import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { NavBar } from '@/ui';
import { C, T } from '@/theme';

/**
 * Textos de ayuda. El texto legal definitivo lo redacta el negocio; esto describe
 * cómo funciona la app sin prometer nada que no haga.
 */
const TOPICS: Record<string, { title: string; sections: [string, string][] }> = {
  pago: {
    title: 'Cómo funciona el pago',
    sections: [
      ['1. Pagás a ComprasMío!', 'Al confirmar tu compra te mostramos el QR de ComprasMío!, el monto exacto y una referencia. Transferí desde la app de tu banco y escribí la referencia en la glosa.'],
      ['2. Subís el comprobante', 'Tenés unos minutos para enviar la foto o el PDF del comprobante. Mientras tanto te guardamos el stock.'],
      ['3. Verificamos', 'Nuestro equipo revisa que la transferencia haya llegado. Si algo no coincide, te avisamos el motivo y podés enviar otro comprobante.'],
      ['4. El vendedor prepara tu pedido', 'Con el pago confirmado, cada vendedor prepara y envía su parte. Seguís el estado desde Mis compras.'],
      ['5. Confirmás que llegó', 'Cuando recibas el pedido, confirmalo. Si hay un problema, usá "Tengo un problema" y lo revisamos con vos. Al vendedor le pagamos cada semana por los pedidos entregados.'],
    ],
  },
  terminos: {
    title: 'Términos y privacidad',
    sections: [
      ['Qué datos guardamos', 'Tu nombre, celular, direcciones de entrega, pedidos, comprobantes de pago y mensajes con las tiendas. Los usamos para procesar tus compras y darte soporte.'],
      ['Con quién los compartimos', 'Cada vendedor ve el nombre, teléfono y dirección de entrega de los pedidos que te tiene que enviar. No vendemos tus datos.'],
      ['Comprobantes', 'Los comprobantes y archivos privados se guardan cifrados y solo los ve el equipo de verificación.'],
      ['Tu cuenta', 'Podés editar tus datos o borrar tu cuenta desde Cuenta. Para dudas, escribinos desde Ayuda.'],
    ],
  },
};

export default function Ayuda() {
  const { tema = 'pago' } = useLocalSearchParams<{ tema: string }>();
  const topic = TOPICS[tema] || TOPICS.pago;
  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <NavBar title={topic.title} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 60 }}>
        {topic.sections.map(([h, body]) => (
          <View key={h} style={{ gap: 6 }}>
            <Text style={T.headline}>{h}</Text>
            <Text style={[T.body, { color: C.label2 }]}>{body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
