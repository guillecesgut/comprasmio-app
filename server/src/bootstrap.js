import * as db from './db.js';
import { hash } from './auth.js';

/**
 * En un hosting gratuito (Render, por ejemplo) el disco no sobrevive un
 * redeploy: cada vez que subís código nuevo, la base arranca vacía. Sin
 * acceso a una shell para correr un script a mano, esto arma solo las
 * cuentas de prueba a partir de variables de entorno al iniciar — así
 * alcanza con pushear el código y esperar, sin ningún paso manual.
 *
 * Configurá esto en Render → tu servicio → Environment (sin tocar código):
 *   SEED_SELLER_PHONE, SEED_SELLER_PASSWORD, SEED_SELLER_NAME
 *   SEED_BUYER_PHONE,  SEED_BUYER_PASSWORD,  SEED_BUYER_NAME
 *
 * Si no configurás nada, no se crea ninguna cuenta: la plataforma arranca
 * realmente vacía, tal como espera alguien que entra por primera vez.
 */
export function bootstrapIfEmpty() {
  const state = db.get();
  if (state.users.length > 0) return; // ya hay datos: no tocar nada

  const sellerPhone = process.env.SEED_SELLER_PHONE;
  const buyerPhone = process.env.SEED_BUYER_PHONE;
  if (!sellerPhone && !buyerPhone) return; // nada configurado: queda vacía

  const handleOf = (name, fallback) =>
    (name || fallback)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 18) || fallback;

  function makeUser(phone, password, name, role) {
    if (!phone || !password) return null;
    const displayName = name || (role === 'seller' ? 'Vendedor' : 'Comprador');

    const user = db.insert('users', {
      id: db.id('usr'),
      name: displayName,
      handle: handleOf(displayName, role),
      initials: displayName.trim().slice(0, 2).toUpperCase(),
      phone,
      password: hash(password),
      role,
      sellerId: null,
      favorites: [],
      createdAt: new Date().toISOString(),
    });

    if (role === 'seller') {
      const seller = db.insert('sellers', {
        id: db.id('sel'),
        ownerId: user.id,
        name: displayName,
        initials: user.initials,
        verified: true,
        rating: 100,
        // El QR real se completa después desde el panel; esto solo destraba el arranque.
        qr: { bank: 'Banco Nacional de Bolivia', account: '—', holder: displayName, payload: null },
        createdAt: new Date().toISOString(),
      });
      db.update('users', user.id, { sellerId: seller.id });
    }
    return user;
  }

  const seller = makeUser(sellerPhone, process.env.SEED_SELLER_PASSWORD, process.env.SEED_SELLER_NAME, 'seller');
  const buyer = makeUser(buyerPhone, process.env.SEED_BUYER_PASSWORD, process.env.SEED_BUYER_NAME, 'buyer');
  db.flush();

  console.log('Bootstrap        →  cuentas creadas desde variables de entorno:');
  if (seller) console.log(`  ${seller.phone}  ·  ${seller.name}  ·  vendedor`);
  if (buyer) console.log(`  ${buyer.phone}  ·  ${buyer.name}  ·  comprador`);
}
