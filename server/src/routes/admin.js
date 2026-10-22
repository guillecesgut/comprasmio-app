import { Router } from 'express';
import { handle, requireAdmin } from '../auth.js';
import * as admin from '../services/admin.js';
import * as orders from '../services/orders.js';
import * as payouts from '../services/payouts.js';
import * as plans from '../services/plans.js';
import * as content from '../services/content.js';
import * as dashboard from '../services/dashboard.js';

/**
 * Panel de administración (serie F). Roles: admin (todo), pagos (pagos, pedidos, liquidaciones,
 * reclamos, suscripciones) y moderador (catálogo, reportes, compradores).
 */
const router = Router();
router.use(requireAdmin());
const pagos = requireAdmin('pagos');
const moderador = requireAdmin('moderador');
const soloAdmin = requireAdmin('__solo_admin__'); // solo pasa admin

router.get('/dashboard', handle(async (_req, res) => res.json(await dashboard.adminDashboard())));

// F2 · pagos
router.get('/payments', pagos, handle(async (req, res) => res.json({ payments: await admin.paymentsQueue(req.query.status) })));
router.get('/payments/:id', pagos, handle(async (req, res) => res.json({ payment: await orders.paymentView(null, req.params.id, { admin: true }) })));
router.post('/payments/:id/approve', pagos, handle(async (req, res) => res.json(await orders.approvePayment(req.user.id, req.params.id))));
router.post('/payments/:id/reject', pagos, handle(async (req, res) => res.json(await orders.rejectPayment(req.user.id, req.params.id, req.body?.reason))));

// F3 · pedidos
router.get('/orders', pagos, handle(async (req, res) => res.json({ orders: await admin.ordersList(req.query) })));
router.get('/orders/:id', pagos, handle(async (req, res) => res.json({ order: await orders.orderDetail(null, req.params.id, { admin: true }) })));
router.post('/orders/:id/cancel', pagos, handle(async (req, res) => { await admin.cancelOrder(req.user.id, req.params.id, req.body || {}); res.json({ ok: true }); }));

// F4 · liquidaciones
router.get('/payouts', pagos, handle(async (req, res) => res.json(await payouts.adminPayouts(req.query))));
router.post('/payouts/cut', pagos, handle(async (req, res) => res.json(await payouts.generateCut(req.user.id, req.body?.periodEnd))));
router.get('/payouts/export', pagos, handle(async (req, res) => {
  const csv = await payouts.payoutsCsv(req.query.periodEnd);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${csv.filename}"`);
  res.send(csv.body);
}));
router.get('/payouts/:id', pagos, handle(async (req, res) => res.json({ payout: await payouts.payoutDetail(req.params.id) })));
router.post('/payouts/:id/paid', pagos, handle(async (req, res) => { await payouts.markPaid(req.user.id, req.params.id, req.body || {}); res.json({ ok: true }); }));

// F5 · reclamos
router.get('/claims', pagos, handle(async (req, res) => res.json({ claims: await admin.claimsList(req.query.status) })));
router.post('/claims/:id/ask-seller', pagos, handle(async (req, res) => { await admin.setClaimWaiting(req.user.id, req.params.id); res.json({ ok: true }); }));
router.post('/claims/:id/resolve', pagos, handle(async (req, res) => { await orders.resolveClaim(req.user.id, req.params.id, req.body || {}); res.json({ ok: true }); }));

// F6 · vendedores
router.get('/sellers', handle(async (req, res) => res.json({ sellers: await admin.sellersList(req.query) })));
router.get('/sellers/:id', handle(async (req, res) => res.json({ seller: await admin.sellerDetail(req.params.id) })));
router.patch('/sellers/:id', soloAdmin, handle(async (req, res) => { await admin.updateSeller(req.user.id, req.params.id, req.body || {}); res.json({ seller: await admin.sellerDetail(req.params.id) }); }));
router.post('/sellers/:id/account', pagos, handle(async (req, res) => { await payouts.reviewPayoutAccount(req.user.id, req.params.id, req.body || {}); res.json({ seller: await admin.sellerDetail(req.params.id) }); }));

// F7 · compradores
router.get('/buyers', moderador, handle(async (req, res) => res.json({ buyers: await admin.buyersList(req.query) })));
router.patch('/users/:id/status', moderador, handle(async (req, res) => { await admin.setUserStatus(req.user.id, req.params.id, req.body?.status); res.json({ ok: true }); }));

// F8 · suscripciones
router.get('/subscriptions', pagos, handle(async (_req, res) => res.json({ subscriptions: await plans.subscriptions() })));
router.post('/subscriptions/:sellerId', soloAdmin, handle(async (req, res) => res.json({ until: await plans.grantPremiumManually(req.user.id, req.params.sellerId, req.body?.days) })));

// F9 · catálogo y moderación
router.get('/products', moderador, handle(async (req, res) => res.json({ products: await admin.searchProducts(req.query.q) })));
router.post('/products/:id/pause', moderador, handle(async (req, res) => { await admin.moderateProduct(req.user.id, req.params.id, req.body?.reason); res.json({ ok: true }); }));
router.get('/reports', moderador, handle(async (req, res) => res.json({ reports: await admin.reportsList(req.query.status) })));
router.patch('/reports/:id', moderador, handle(async (req, res) => { await admin.resolveReport(req.user.id, req.params.id, req.body?.status); res.json({ ok: true }); }));

// F10 · categorías
router.get('/categories', handle(async (_req, res) => res.json({ categories: await content.adminCategories() })));
router.post('/categories', soloAdmin, handle(async (req, res) => res.status(201).json({ id: await content.saveCategory(req.body || {}) })));
router.put('/categories/order', soloAdmin, handle(async (req, res) => { await content.reorderCategories(req.body?.ids || []); res.json({ ok: true }); }));
router.put('/categories/:id', soloAdmin, handle(async (req, res) => res.json({ id: await content.saveCategory(req.body || {}, req.params.id) })));

// F11 · banners y destacados
router.get('/banners', handle(async (_req, res) => res.json({ banners: await content.adminBanners() })));
router.post('/banners', soloAdmin, handle(async (req, res) => res.status(201).json({ id: await content.saveBanner(req.body || {}) })));
router.put('/banners/order', soloAdmin, handle(async (req, res) => { await content.reorderBanners(req.body?.ids || []); res.json({ ok: true }); }));
router.put('/banners/:id', soloAdmin, handle(async (req, res) => res.json({ id: await content.saveBanner(req.body || {}, req.params.id) })));
router.delete('/banners/:id', soloAdmin, handle(async (req, res) => { await content.deleteBanner(req.params.id); res.json({ ok: true }); }));
router.get('/featured', handle(async (_req, res) => res.json(await content.featured())));
router.put('/featured/:kind', soloAdmin, handle(async (req, res) => res.json(await content.setFeatured(req.params.kind, req.body?.ids || []))));

// F12/F13 · planes, comisiones y configuración (incluido el QR de cobro)
router.get('/settings', handle(async (_req, res) => res.json({ settings: await admin.settings() })));
router.put('/settings', soloAdmin, handle(async (req, res) => res.json({ settings: await admin.updateSettings(req.user.id, req.body || {}) })));
router.get('/qrs', handle(async (_req, res) => res.json({ qrs: await admin.qrs() })));
router.post('/qrs', soloAdmin, handle(async (req, res) => res.status(201).json({ id: await admin.addQr(req.user.id, req.body || {}) })));
router.post('/qrs/:id/activate', soloAdmin, handle(async (req, res) => res.json({ qrs: await admin.activateQr(req.user.id, req.params.id) })));

// F14 · equipo y registro
router.get('/team', soloAdmin, handle(async (_req, res) => res.json({ team: await admin.team() })));
router.post('/team', soloAdmin, handle(async (req, res) => res.status(201).json({ id: await admin.addTeamMember(req.user.id, req.body || {}) })));
router.patch('/team/:id', soloAdmin, handle(async (req, res) => { await admin.updateTeamMember(req.user.id, req.params.id, req.body || {}); res.json({ ok: true }); }));
router.get('/audit', soloAdmin, handle(async (req, res) => res.json({ entries: await admin.auditLog(req.query) })));

export default router;
