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

export default router;
