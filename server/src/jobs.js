import * as orders from './services/orders.js';

/**
 * Procesos programados dentro del mismo servidor (una sola instancia):
 * - cada 30 s: vencer los pagos cuya ventana terminó (libera el stock apartado);
 * - cada 30 min: dar por entregados los pedidos enviados hace N días sin confirmar.
 * El corte semanal de liquidaciones lo dispara un operador desde el panel (F4).
 */
export function startJobs() {
  let busy = false;
  const run = async (name, fn) => {
    try {
      const n = await fn();
      if (n) console.log(`[jobs] ${name}: ${n}`);
    } catch (err) {
      console.error(`[jobs] ${name} falló`, err.message);
    }
  };
  const fast = setInterval(async () => {
    if (busy) return;
    busy = true;
    await run('pagos vencidos', orders.expireDuePayments);
    busy = false;
  }, 30_000);
  const slow = setInterval(() => run('entregado automático', orders.autoDeliver), 30 * 60_000);
  run('pagos vencidos', orders.expireDuePayments);
  run('entregado automático', orders.autoDeliver);
  return () => { clearInterval(fast); clearInterval(slow); };
}
