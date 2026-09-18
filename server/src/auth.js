import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import * as db from './db.js';

const SECRET = process.env.JWT_SECRET || 'comprasmio-dev-secret';
const TTL = '30d';

export const hash = (plain) => bcrypt.hashSync(plain, 10);
export const compare = (plain, digest) => bcrypt.compareSync(plain, digest);

export const sign = (user) =>
  jwt.sign({ sub: user.id, role: user.role, handle: user.handle }, SECRET, { expiresIn: TTL });

export function verify(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

/** Lee el usuario del header Authorization sin exigirlo. */
export function attachUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verify(token) : null;
  req.user = payload ? db.find('users', (u) => u.id === payload.sub) || null : null;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Iniciá sesión para continuar.' });
  next();
}

export function requireSeller(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Iniciá sesión para continuar.' });
  if (req.user.role !== 'seller')
    return res.status(403).json({ error: 'Esta acción es solo para vendedores.' });
  next();
}

export const publicUser = (u) =>
  u && {
    id: u.id,
    name: u.name,
    handle: u.handle,
    phone: u.phone,
    role: u.role,
    sellerId: u.sellerId || null,
    address: u.address || null,
    initials: u.initials,
  };
