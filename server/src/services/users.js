import { one, many, id, tx, fail } from '../db.js';
import { hash, compare } from '../auth.js';
import { handleFrom, initialsFrom, slugify, normalizePhone, colorFor } from '../util.js';
import { getSettings, isPremium, commissionBpFor } from '../settings.js';
import * as storage from '../storage.js';

async function uniqueHandle(base, q) {
  let handle = base;
  for (let n = 2; await one('SELECT 1 FROM users WHERE handle = $1', [handle], q); n++) handle = `${base}${n}`;
  return handle;
}

async function uniqueSlug(base, q) {
  let slug = base;
  for (let n = 2; await one('SELECT 1 FROM sellers WHERE slug = $1', [slug], q); n++) slug = `${base}-${n}`;
  return slug;
}

/** Alta con celular. Un vendedor nace en plan Básico. */
export async function signup({ name, phone, password, role }) {
  const cleanName = String(name || '').trim();
  const cleanPhone = normalizePhone(phone);
  if (cleanName.length < 2) fail(400, 'Escribí tu nombre.');
  if (cleanPhone.length < 8) fail(400, 'Escribí tu número de celular.');
  if (!password || String(password).length < 6) fail(400, 'La contraseña necesita al menos 6 caracteres.');
  const wantsSeller = role === 'seller';

  return tx(async (q) => {
    if (await one('SELECT 1 FROM users WHERE phone = $1', [cleanPhone], q))
      fail(409, 'Ese número ya tiene una cuenta. Iniciá sesión.');
    const user = await one(
      `INSERT INTO users(id, name, handle, initials, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id('usr'), cleanName, await uniqueHandle(handleFrom(cleanName), q), initialsFrom(cleanName), cleanPhone,
        hash(password), wantsSeller ? 'seller' : 'buyer'],
      q
    );
    if (wantsSeller) {
      await one(
        `INSERT INTO sellers(id, user_id, slug, name, initials, color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [id('sel'), user.id, await uniqueSlug(slugify(cleanName), q), cleanName, user.initials, colorFor(user.id)],
        q
      );
    }
    return user.id;
  });
}

export async function login({ phone, email, password }) {
  const user = email
    ? await one(`SELECT * FROM users WHERE lower(email) = lower($1) AND role = 'admin'`, [String(email).trim()])
    : await one('SELECT * FROM users WHERE phone = $1', [normalizePhone(phone)]);
  if (!user || !compare(password, user.password_hash))
    fail(401, email ? 'El email o la contraseña no coinciden.' : 'El número o la contraseña no coinciden.');
  if (user.status !== 'active') fail(403, 'Tu cuenta está bloqueada. Escribinos a soporte.');
  return user.id;
}

/** Lo que la app sabe del usuario en sesión (Session del handoff). */
export async function profile(userId) {
  const u = await one('SELECT * FROM users WHERE id = $1', [userId]);
  if (!u) fail(404, 'Esa cuenta no existe.');
  const seller = await one('SELECT * FROM sellers WHERE user_id = $1', [userId]);
  const blocked = await many(
    'SELECT b.blocked_user_id AS id, u.handle FROM user_blocks b JOIN users u ON u.id = b.blocked_user_id WHERE b.user_id = $1',
    [userId]
  );
  const settings = await getSettings();
  return {
    id: u.id,
    name: u.name,
    handle: u.handle,
    initials: u.initials,
    phone: u.phone,
    email: u.email,
    role: u.role,
    adminRole: u.admin_role,
    sellerId: seller?.id || null,
    plan: seller ? (isPremium(seller) ? 'premium' : 'basico') : null,
    planUntil: seller?.plan_until || null,
    commissionPct: seller ? commissionBpFor(seller, settings) / 100 : null,
    blocked: blocked.map((b) => b.handle),
    blockedIds: blocked.map((b) => b.id),
  };
}

export async function updateProfile(userId, { name, email }) {
  const clean = String(name || '').trim();
  if (clean.length < 2) fail(400, 'Escribí tu nombre.');
  const mail = email === undefined ? undefined : String(email || '').trim() || null;
  if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) fail(400, 'Ese email no es válido.');
  if (mail && (await one('SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2', [mail, userId]))) fail(409, 'Ese email ya está en otra cuenta.');
  await one(
    'UPDATE users SET name = $2, initials = $3, email = CASE WHEN $4::boolean THEN $5 ELSE email END WHERE id = $1 RETURNING id',
    [userId, clean, initialsFrom(clean), mail !== undefined, mail ?? null]
  );
  return profile(userId);
}

export async function changePassword(userId, { current, next }) {
  const u = await one('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!compare(current, u.password_hash)) fail(401, 'La contraseña actual no coincide.');
  if (!next || String(next).length < 6) fail(400, 'La contraseña nueva necesita al menos 6 caracteres.');
  await one('UPDATE users SET password_hash = $2 WHERE id = $1 RETURNING id', [userId, hash(next)]);
}

/** Bloquear / desbloquear por handle (desde el chat de una sala). */
export async function toggleBlock(userId, handle) {
  const target = await one('SELECT id FROM users WHERE handle = $1', [handle]);
  if (!target) fail(404, 'Esa persona ya no existe.');
  if (target.id === userId) fail(400, 'No podés bloquearte a vos mismo.');
  const existing = await one('DELETE FROM user_blocks WHERE user_id = $1 AND blocked_user_id = $2 RETURNING 1', [userId, target.id]);
  if (!existing) await one('INSERT INTO user_blocks(user_id, blocked_user_id) VALUES ($1, $2) RETURNING 1', [userId, target.id]);
  return profile(userId);
}

export async function report(userId, { handle, text, streamId, productId, reason }) {
  if (!handle && !productId && !String(text || '').trim()) fail(400, 'Falta qué reportar.');
  const target = handle ? await one('SELECT id FROM users WHERE handle = $1', [handle]) : null;
  await one(
    `INSERT INTO reports(id, by_user_id, target_user_id, target_handle, product_id, stream_id, text, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [id('rep'), userId, target?.id || null, handle || null, productId || null, streamId || null,
      String(text || '').slice(0, 500), String(reason || 'inapropiado').slice(0, 60)]
  );
}

/**
 * Borrar la cuenta (requisito de Apple). Si hay pedidos en curso no se puede: primero tienen que
 * cerrarse, porque hay dinero de por medio. Los pedidos cerrados quedan como registro contable.
 */
export async function deleteAccount(userId, password) {
  const u = await one('SELECT * FROM users WHERE id = $1', [userId]);
  if (!compare(password, u.password_hash)) fail(401, 'La contraseña no coincide.');
  const seller = await one('SELECT id FROM sellers WHERE user_id = $1', [userId]);
  const open = await one(
    `SELECT count(*)::int AS n FROM orders
     WHERE (buyer_id = $1 OR seller_id = $2)
       AND status IN ('pendiente_pago','pago_en_revision','pagado','preparando','enviado','en_reclamo')`,
    [userId, seller?.id || null]
  );
  if (open.n > 0) fail(409, `Tenés ${open.n} pedido${open.n === 1 ? '' : 's'} en curso. Cuando se cierren vas a poder borrar tu cuenta.`);
  if (seller) {
    const pending = await one(`SELECT count(*)::int AS n FROM payouts WHERE seller_id = $1 AND status = 'programada'`, [seller.id]);
    if (pending.n > 0) fail(409, 'Tenés un pago semanal pendiente. Podés borrar tu cuenta después de recibirlo.');
  }
  await tx(async (q) => {
    // Los pedidos y pagos cerrados se conservan anonimizados; el resto se borra en cascada.
    await q.query(`UPDATE users SET name = 'Cuenta eliminada', handle = $2, initials = '—', phone = NULL,
                   email = $3, password_hash = '', status = 'blocked' WHERE id = $1`,
      [userId, `eliminada_${userId.slice(-8)}`, `eliminada+${userId}@comprasmio.invalid`]);
    await q.query('DELETE FROM addresses WHERE user_id = $1', [userId]);
    await q.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
    await q.query('DELETE FROM wishlist WHERE user_id = $1', [userId]);
    await q.query('DELETE FROM follows WHERE user_id = $1', [userId]);
    await q.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    await q.query('DELETE FROM user_blocks WHERE user_id = $1 OR blocked_user_id = $1', [userId]);
    if (seller) {
      await q.query(`UPDATE products SET status = 'deleted' WHERE seller_id = $1`, [seller.id]);
      await q.query(`UPDATE sellers SET status = 'suspended', name = 'Tienda eliminada', bio = NULL, socials = '{}' WHERE id = $1`, [seller.id]);
      await q.query('DELETE FROM payout_accounts WHERE seller_id = $1', [seller.id]);
    }
  });
}

/** Crea o actualiza el administrador inicial desde variables de entorno (ADMIN_EMAIL, ADMIN_PASSWORD). */
export async function ensureAdmin({ email, password, name = 'Administración' }) {
  if (!email || !password) return null;
  const existing = await one('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  if (existing) return existing.id;
  const row = await one(
    `INSERT INTO users(id, name, handle, initials, email, password_hash, role, admin_role)
     VALUES ($1, $2, $3, 'CM', $4, $5, 'admin', 'admin') RETURNING id`,
    [id('usr'), name, `admin_${Date.now().toString(36)}`, email.trim(), hash(password)]
  );
  return row.id;
}

/** Imagen firmada o null; helper para presentar avatares. */
export const fileUrl = (key) => storage.url(key);
