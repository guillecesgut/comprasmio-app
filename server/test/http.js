import http from 'node:http';
import { createApp } from '../src/app.js';
import { ensureAdmin } from '../src/services/users.js';
import * as db from '../src/db.js';
import * as hub from '../src/realtime/hub.js';

/** Levanta la app en un puerto libre y devuelve un cliente fetch mínimo. */
export async function startApi() {
  const server = http.createServer(createApp());
  const wss = hub.attach(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const call = async (method, path, { token, body, form } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: form || (body ? JSON.stringify(body) : undefined),
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
  const as = (token) => ({
    get: (p) => call('GET', p, { token }),
    post: (p, body) => call('POST', p, { token, body: body || {} }),
    put: (p, body) => call('PUT', p, { token, body: body || {} }),
    patch: (p, body) => call('PATCH', p, { token, body: body || {} }),
    del: (p, body) => call('DELETE', p, { token, body }),
    upload: (folder, name = 'foto.png', type = 'image/png') => {
      const form = new FormData();
      form.append('folder', folder);
      form.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type }), name);
      return call('POST', '/uploads', { token, form });
    },
  });

  let phone = 70000000 + Math.floor(Math.random() * 900000);
  const signup = async (role, name = role === 'seller' ? 'Relojería Andina' : 'Ana Quispe') => {
    const r = await call('POST', '/auth/signup', { body: { name, phone: String(phone++), password: 'secreto1', role } });
    if (r.status !== 201) throw new Error(`signup ${r.status} ${JSON.stringify(r.data)}`);
    return { ...as(r.data.token), user: r.data.user, token: r.data.token };
  };
  const admin = async () => {
    await ensureAdmin({ email: 'admin@comprasmio.test', password: 'clave-admin-123' });
    const r = await call('POST', '/auth/login', { body: { email: 'admin@comprasmio.test', password: 'clave-admin-123' } });
    return as(r.data.token);
  };

  const wsUrl = base.replace(/^http/, 'ws').replace(/\/api$/, '/ws');
  return { base, wsUrl, call, as, signup, admin, stop: () => new Promise((r) => {
    for (const c of wss.clients) c.terminate();
    wss.close();
    server.closeAllConnections?.();
    server.close(r);
  }) };
}

/** QR de cobro activo (el checkout lo exige). */
export async function activateQr(adm) {
  const up = await adm.upload('qrs', 'qr.png');
  const created = await adm.post('/admin/qrs', { imageKey: up.data.key, bank: 'Banco Unión', holder: 'ComprasMío! SRL', account: '1000-2345-67' });
  await adm.post(`/admin/qrs/${created.data.id}/activate`);
  return created.data.id;
}

export const sql = (text, params) => db.query(text, params);
