import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { one, fail } from './db.js';

const TTL = '30d';
const ADMIN_TTL = '12h';

export const hash = (plain) => bcrypt.hashSync(plain, 10);
export const compare = (plain, digest) => Boolean(digest) && bcrypt.compareSync(plain || '', digest);

export const sign = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: user.role === 'admin' ? ADMIN_TTL : TTL });

export function verify(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

/** Lee el usuario del header Authorization sin exigirlo. Un usuario bloqueado o borrado no entra. */
export async function attachUser(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const payload = token ? verify(token) : null;
    req.user = null;
    if (payload) {
      const user = await one(
        `SELECT u.*, s.id AS seller_id FROM users u LEFT JOIN sellers s ON s.user_id = u.id WHERE u.id = $1`,
        [payload.sub]
      );
      if (user && user.status === 'active') req.user = user;
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(Object.assign(new Error('Iniciá sesión para continuar.'), { status: 401 }));
  next();
}

export function requireSeller(req, _res, next) {
  if (!req.user) return next(Object.assign(new Error('Iniciá sesión para continuar.'), { status: 401 }));
  if (req.user.role !== 'seller' || !req.user.seller_id)
    return next(Object.assign(new Error('Esta acción es solo para vendedores.'), { status: 403 }));
  next();
}

/** Administradores del panel. `roles` limita a ciertos roles (admin siempre pasa). */
export const requireAdmin = (...roles) => (req, _res, next) => {
  if (!req.user || req.user.role !== 'admin')
    return next(Object.assign(new Error('Acceso solo para el equipo de ComprasMío!.'), { status: 403 }));
  if (roles.length && req.user.admin_role !== 'admin' && !roles.includes(req.user.admin_role))
    return next(Object.assign(new Error('Tu rol no tiene permiso para esta sección.'), { status: 403 }));
  next();
};

/** Envuelve un handler async para que los errores lleguen al manejador central. */
export const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function assertOwner(condition) {
  if (!condition) fail(404, 'No encontramos lo que buscás.');
}
