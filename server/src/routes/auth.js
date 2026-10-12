import { Router } from 'express';
import * as db from '../db.js';
import { hash, compare, sign, publicUser, requireAuth } from '../auth.js';

const router = Router();

const handleFrom = (name) =>
  name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 18) || 'usuario';

const initialsFrom = (name) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'US';

function uniqueHandle(base) {
  let handle = base;
  let n = 1;
  while (db.find('users', (u) => u.handle === handle)) handle = `${base}${++n}`;
  return handle;
}

router.post('/signup', (req, res) => {
  const { name, phone, password, role } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Escribí tu nombre.' });
  if (!phone?.trim()) return res.status(400).json({ error: 'Escribí tu número de celular.' });
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'La contraseña necesita al menos 6 caracteres.' });
  if (db.find('users', (u) => u.phone === phone.trim()))
    return res.status(409).json({ error: 'Ese número ya tiene una cuenta. Iniciá sesión.' });

  const wantsSeller = role === 'seller';
  const user = {
    id: db.id('usr'),
    name: name.trim(),
    handle: uniqueHandle(handleFrom(name)),
    initials: initialsFrom(name),
    phone: phone.trim(),
    password: hash(password),
    role: wantsSeller ? 'seller' : 'buyer',
    sellerId: null,
    address: null,
    createdAt: new Date().toISOString(),
  };

  if (wantsSeller) {
    const seller = db.insert('sellers', {
      id: db.id('sel'),
      ownerId: user.id,
      name: name.trim(),
      verified: false,
      rating: 100,
      // El QR es por cuenta de vendedor: el comprador paga por transferencia bancaria.
      qr: { bank: 'Banco Nacional de Bolivia', account: '—', holder: name.trim(), payload: null },
      createdAt: new Date().toISOString(),
    });
    user.sellerId = seller.id;
  }

  db.insert('users', user);
  res.status(201).json({ token: sign(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { phone, password } = req.body || {};
  const user = db.find('users', (u) => u.phone === (phone || '').trim());
  if (!user || !user.password || !compare(password || '', user.password))
    return res.status(401).json({ error: 'El número o la contraseña no coinciden.' });
  res.json({ token: sign(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch('/me', requireAuth, (req, res) => {
  const { name, address } = req.body || {};
  const patch = {};
  if (typeof name === 'string' && name.trim()) {
    patch.name = name.trim();
    patch.initials = initialsFrom(name);
  }
  if (typeof address === 'string') patch.address = address.trim();
  const user = db.update('users', req.user.id, patch);
  res.json({ user: publicUser(user) });
});

/**
 * Borrar la cuenta desde la app: requisito de Apple para cualquier app con
 * registro (App Store Review 5.1.1(v)). Pide la contraseña para que un
 * celular desbloqueado en manos ajenas no alcance para borrarla.
 * Las órdenes quedan como registro contable del vendedor, sin datos de contacto.
 */
router.delete('/me', requireAuth, (req, res) => {
  const { password } = req.body || {};
  if (!req.user.password || !compare(password || '', req.user.password))
    return res.status(401).json({ error: 'La contraseña no coincide.' });

  const user = req.user;
  if (user.sellerId) {
    for (const stream of db.filter('streams', (s) => s.sellerId === user.sellerId && s.live))
      db.update('streams', stream.id, { live: false, endedAt: new Date().toISOString() });
    for (const product of db.filter('products', (p) => p.sellerId === user.sellerId))
      db.remove('products', product.id);
    db.remove('sellers', user.sellerId);
  }
  for (const row of db.filter('threads', (t) => t.buyerId === user.id || t.sellerId === user.sellerId))
    db.remove('threads', row.id);
  for (const row of db.filter('notifications', (n) => n.userId === user.id)) db.remove('notifications', row.id);
  for (const order of db.filter('orders', (o) => o.buyerId === user.id))
    db.update('orders', order.id, { buyerHandle: 'cuenta_eliminada' });
  db.remove('users', user.id);
  res.json({ ok: true });
});

/** Bloquear / desbloquear a alguien: sus mensajes dejan de verse en las salas. */
router.put('/me/blocked/:handle', requireAuth, (req, res) => {
  const current = new Set(req.user.blocked || []);
  const handle = req.params.handle;
  current.has(handle) ? current.delete(handle) : current.add(handle);
  const user = db.update('users', req.user.id, { blocked: [...current] });
  res.json({ user: publicUser(user) });
});

/**
 * Reportar un mensaje o un usuario (App Store Review 1.2, contenido generado
 * por usuarios). Queda guardado para revisión manual.
 */
router.post('/report', requireAuth, (req, res) => {
  const { handle, text, streamId, reason } = req.body || {};
  if (!handle) return res.status(400).json({ error: 'Falta a quién reportar.' });
  db.insert('reports', {
    id: db.id('rep'),
    by: req.user.id,
    handle: String(handle).slice(0, 40),
    text: String(text || '').slice(0, 500),
    streamId: streamId || null,
    reason: String(reason || 'inapropiado').slice(0, 60),
    at: new Date().toISOString(),
  });
  console.log(`[reporte] @${req.user.handle} reportó a @${handle}`);
  res.status(201).json({ ok: true });
});

export default router;
