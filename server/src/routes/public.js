import { Router } from 'express';
import { handle } from '../auth.js';
import { one } from '../db.js';
import * as catalog from '../services/catalog.js';
import * as content from '../services/content.js';
import * as live from '../services/live.js';
import * as orders from '../services/orders.js';
import { getSettings } from '../settings.js';

/** Lo que se ve sin iniciar sesión (y con sesión, con favoritos y seguidos marcados). */
const router = Router();
const viewer = (req) => ({ viewerId: req.user?.id });

router.get('/config', handle(async (_req, res) => {
  const s = await getSettings();
  res.json({
    live: live.liveConfig(),
    paymentWindows: { catalog: s.payment_window_catalog_min, live: s.payment_window_live_min },
    support: { whatsapp: s.support_whatsapp, email: s.support_email },
    cities: catalog.cities(),
  });
}));

router.get('/home', handle(async (req, res) => res.json(await content.home(viewer(req)))));

router.get('/categories', handle(async (_req, res) => res.json({ categories: await catalog.categoryTree() })));

router.get('/products', handle(async (req, res) => {
  if (req.query.q && !req.query.offset) catalog.logSearch(req.query.q).catch(() => {});
  res.json(await catalog.listProducts(req.query, viewer(req)));
}));

router.get('/products/:id', handle(async (req, res) => res.json({ product: await catalog.productDetail(req.params.id, viewer(req)) })));

router.get('/sellers/:slug', handle(async (req, res) => res.json({ seller: await catalog.sellerPublic(req.params.slug, viewer(req)) })));

router.get('/sellers/:slug/reviews', handle(async (req, res) => {
  const s = await one('SELECT id FROM sellers WHERE slug = $1 OR id = $1', [req.params.slug]);
  res.json({ reviews: s ? await orders.publicReviews(s.id) : [] });
}));

router.get('/search/suggest', handle(async (req, res) => res.json(await catalog.suggestions(req.query.q))));
router.get('/search/trending', handle(async (_req, res) => res.json({ queries: await catalog.trending() })));
router.get('/search/counts', handle(async (req, res) => res.json(await catalog.searchCounts(req.query.q))));
router.get('/search/sellers', handle(async (req, res) => res.json({ sellers: await catalog.searchSellers(req.query.q, viewer(req)) })));

router.get('/streams', handle(async (req, res) => {
  res.json({ streams: await live.liveCards({ mode: req.query.mode, q: req.query.q, limit: req.query.limit }) });
}));

router.get('/streams/:id', handle(async (req, res) => res.json(await live.room(req.params.id, req.user))));

export default router;
