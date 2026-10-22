import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type { Upload } from './api';

/**
 * Elegir fotos y archivos para subir (comprobantes, fotos de producto, reclamos).
 * Devuelve null si la persona cancela; lanza un Error con texto en español si
 * falta el permiso.
 */
const asUpload = (asset: { uri: string; fileName?: string | null; mimeType?: string | null; name?: string }): Upload => {
  const type = asset.mimeType || (/\.png$/i.test(asset.uri) ? 'image/png' : /\.pdf$/i.test(asset.uri) ? 'application/pdf' : 'image/jpeg');
  const name = asset.fileName || asset.name || `archivo.${type.split('/')[1] || 'jpg'}`;
  return { uri: asset.uri, name, type };
};

export async function pickFromLibrary(options: { multiple?: number; square?: boolean } = {}): Promise<Upload[] | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Sin permiso para ver tus fotos. Habilitalo en Ajustes → ComprasMío!.');
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsMultipleSelection: (options.multiple || 1) > 1,
    selectionLimit: options.multiple || 1,
    allowsEditing: !!options.square && (options.multiple || 1) === 1,
    aspect: options.square ? [1, 1] : undefined,
  });
  if (res.canceled) return null;
  return res.assets.map(asUpload);
}

export async function takePhoto(): Promise<Upload | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Sin permiso de cámara. Habilitalo en Ajustes → ComprasMío!.');
  const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  if (res.canceled) return null;
  return asUpload(res.assets[0]);
}

export async function pickPdf(): Promise<Upload | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  if (res.canceled) return null;
  return asUpload(res.assets[0]);
}
