import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { freshDb } from './helpers.js';
import { startApi } from './http.js';
import * as hub from '../src/realtime/hub.js';

let drop;
let api;
before(async () => { drop = await freshDb(); api = await startApi(); });
after(async () => { await api.stop(); await drop(); });

/** Conecta, se suscribe a `channel` y devuelve si llegó un evento emitido en ese canal. */
async function receives(token, channel) {
  const ws = new WebSocket(`${api.wsUrl}${token ? `?token=${token}` : ''}`);
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  const got = new Promise((resolve) => {
    ws.on('message', (raw) => { if (JSON.parse(raw).type === 'probe') resolve(true); });
    setTimeout(() => resolve(false), 600);
  });
  ws.send(JSON.stringify({ type: 'subscribe', channel }));
  await new Promise((r) => setTimeout(r, 150));
  hub.emit(channel, 'probe', {});
  const result = await got;
  ws.close();
  return result;
}

test('solo el dueño escucha el canal de su tienda; solo el equipo escucha el canal admin', async () => {
  const seller = await api.signup('seller');
  const other = await api.signup('seller', 'Otra tienda');
  const buyer = await api.signup('buyer');
  const admin = await api.admin();
  const adminLogin = await api.call('POST', '/auth/login', { body: { email: 'admin@comprasmio.test', password: 'clave-admin-123' } });
  void admin;
  const channel = `seller:${seller.user.sellerId}`;

  assert.equal(await receives(seller.token, channel), true);
  assert.equal(await receives(other.token, channel), false);
  assert.equal(await receives(buyer.token, channel), false);
  assert.equal(await receives(null, channel), false);
  assert.equal(await receives(buyer.token, 'admin'), false);
  assert.equal(await receives(adminLogin.data.token, 'admin'), true);
  assert.equal(await receives(null, 'feed'), true, 'el feed es público');
  assert.equal(await receives(buyer.token, `user:${seller.user.id}`), false, 'nadie se suscribe al canal personal de otro');
});
