import { Router } from 'express';
import { handle, requireAuth, sign } from '../auth.js';
import { one } from '../db.js';
import * as users from '../services/users.js';

const router = Router();

const session = async (userId) => {
  const user = await one('SELECT id, role FROM users WHERE id = $1', [userId]);
  return { token: sign(user), user: await users.profile(userId) };
};

router.post('/signup', handle(async (req, res) => {
  const userId = await users.signup(req.body || {});
  res.status(201).json(await session(userId));
}));

router.post('/login', handle(async (req, res) => {
  const userId = await users.login(req.body || {});
  res.json(await session(userId));
}));

router.get('/me', requireAuth, handle(async (req, res) => res.json({ user: await users.profile(req.user.id) })));

router.patch('/me', requireAuth, handle(async (req, res) => res.json({ user: await users.updateProfile(req.user.id, req.body || {}) })));

router.post('/me/password', requireAuth, handle(async (req, res) => {
  await users.changePassword(req.user.id, req.body || {});
  res.json({ ok: true });
}));

/** Borrar la cuenta desde la app (requisito de Apple). */
router.delete('/me', requireAuth, handle(async (req, res) => {
  await users.deleteAccount(req.user.id, req.body?.password);
  res.json({ ok: true });
}));

router.put('/me/blocked/:handle', requireAuth, handle(async (req, res) => {
  res.json({ user: await users.toggleBlock(req.user.id, req.params.handle) });
}));

router.post('/report', requireAuth, handle(async (req, res) => {
  await users.report(req.user.id, req.body || {});
  res.status(201).json({ ok: true });
}));

export default router;
