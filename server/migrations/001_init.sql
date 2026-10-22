-- ComprasMío! v2 · esquema inicial (marketplace + vivos, modo plataforma).
-- Dinero siempre en centavos enteros (*_cents). Porcentajes en puntos básicos (*_bp: 1500 = 15 %).
-- IDs de texto con prefijo (usr_…, prd_…) generados por la app: compatibles con los de la v1.

-- ------------------------------------------------------------- personas ---

CREATE TABLE users (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  handle        text NOT NULL UNIQUE,
  initials      text NOT NULL,
  phone         text UNIQUE,                 -- comprador y vendedor entran con celular
  email         text UNIQUE,                 -- administradores entran con email
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('buyer', 'seller', 'admin')),
  admin_role    text CHECK (admin_role IN ('admin', 'pagos', 'moderador')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE user_blocks (
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_user_id)
);

CREATE TABLE sellers (
  id               text PRIMARY KEY,
  user_id          text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slug             text NOT NULL UNIQUE,
  name             text NOT NULL,
  initials         text NOT NULL,
  bio              text,
  city             text,
  avatar_key       text,
  cover_key        text,
  color            text,                     -- color de marca para placeholders
  socials          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { tiktok, instagram, whatsapp }
  delivery_options text[] NOT NULL DEFAULT ARRAY['envio']::text[],
  verified         boolean NOT NULL DEFAULT false,      -- insignia "Vendedor verificado"
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
  plan             text NOT NULL DEFAULT 'basico' CHECK (plan IN ('basico', 'premium')),
  plan_until       timestamptz,
  commission_bp_override integer CHECK (commission_bp_override BETWEEN 0 AND 10000),
  rating_avg       numeric(3,2) NOT NULL DEFAULT 0,
  rating_count     integer NOT NULL DEFAULT 0,
  rating_pct       integer NOT NULL DEFAULT 100,   -- % de reseñas de 4 o 5 estrellas ("★ 99 %")
  sales_count      integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payout_accounts (
  seller_id      text PRIMARY KEY REFERENCES sellers(id) ON DELETE CASCADE,
  bank           text NOT NULL,
  account_type   text NOT NULL,
  account_number text NOT NULL,
  holder         text NOT NULL,
  holder_doc     text NOT NULL,              -- CI o NIT del titular
  qr_key         text,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  reject_reason  text,
  verified_at    timestamptz,
  verified_by    text REFERENCES users(id),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE addresses (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      text NOT NULL,
  city       text NOT NULL,
  zone       text NOT NULL,
  street     text NOT NULL,
  reference  text,
  phone      text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user ON addresses(user_id);
CREATE UNIQUE INDEX addresses_one_default ON addresses(user_id) WHERE is_default;

CREATE TABLE follows (
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id  text NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  notify     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, seller_id)
);
CREATE INDEX follows_seller ON follows(seller_id);

-- ------------------------------------------------------------ catálogo ---

CREATE TABLE categories (
  id        text PRIMARY KEY,
  parent_id text REFERENCES categories(id) ON DELETE CASCADE,
  name      text NOT NULL,
  slug      text NOT NULL UNIQUE,
  icon      text,                            -- SF Symbol
  position  integer NOT NULL DEFAULT 0,
  active    boolean NOT NULL DEFAULT true
);
CREATE INDEX categories_parent ON categories(parent_id);

CREATE TABLE products (
  id               text PRIMARY KEY,
  seller_id        text NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  category_id      text REFERENCES categories(id) ON DELETE SET NULL,
  title            text NOT NULL,
  description      text NOT NULL DEFAULT '',
  condition        text NOT NULL DEFAULT 'nuevo' CHECK (condition IN ('nuevo', 'usado')),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted')),
  compare_at_cents integer CHECK (compare_at_cents > 0),   -- precio anterior (oferta)
  shipping_options text[] NOT NULL DEFAULT ARRAY['envio_gratis']::text[],
  attributes       jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{ name: 'Talla', values: ['S','M'] }]
  color            text,                                   -- placeholder mientras no hay foto
  search           tsvector GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || description)) STORED,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_seller ON products(seller_id);
CREATE INDEX products_category ON products(category_id) WHERE status = 'active';
CREATE INDEX products_search ON products USING gin(search);

CREATE TABLE product_photos (
  id          text PRIMARY KEY,
  product_id  text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  position    integer NOT NULL DEFAULT 0
);
CREATE INDEX product_photos_product ON product_photos(product_id, position);

-- Stock por variante. `stock` = unidades físicas sin vender. Lo apartado y lo reservado para
-- vivos NO se resta acá: se calcula en stock_available() para no tener dos fuentes de verdad.
CREATE TABLE variants (
  id          text PRIMARY KEY,
  product_id  text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku         text,
  options     jsonb NOT NULL DEFAULT '{}'::jsonb,       -- { "Talla": "M", "Color": "Natural" }
  label       text NOT NULL DEFAULT 'Única',            -- "M · Natural"
  price_cents integer NOT NULL CHECK (price_cents > 0),
  stock       integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sold        integer NOT NULL DEFAULT 0 CHECK (sold >= 0),
  active      boolean NOT NULL DEFAULT true,
  position    integer NOT NULL DEFAULT 0
);
CREATE INDEX variants_product ON variants(product_id, position);

CREATE TABLE bundles (
  id                    text PRIMARY KEY,
  seller_id             text NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  photo_key             text,
  suggested_start_cents integer,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bundle_items (
  bundle_id  text NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  variant_id text NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  qty        integer NOT NULL CHECK (qty > 0),
  PRIMARY KEY (bundle_id, variant_id)
);

CREATE TABLE wishlist (
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id       text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_at_add_cents integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE cart_items (
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant_id text NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  qty        integer NOT NULL CHECK (qty > 0),
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, variant_id)
);

CREATE TABLE search_log (
  id    bigserial PRIMARY KEY,
  query text NOT NULL,
  at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_log_at ON search_log(at);

-- --------------------------------------------------------------- vivos ---

CREATE TABLE streams (
  id           text PRIMARY KEY,
  seller_id    text NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  title        text NOT NULL,
  status       text NOT NULL CHECK (status IN ('scheduled', 'live', 'ended')),
  scheduled_at timestamptz,
  started_at   timestamptz,
  ended_at     timestamptz,
  peak_viewers integer NOT NULL DEFAULT 0,
  base_viewers integer NOT NULL DEFAULT 0,   -- solo para datos de demostración
  color        text,
  tag          text
);
CREATE INDEX streams_status ON streams(status);

-- Lo que el vendedor carga al armar el vivo (E9): una variante con N unidades, o un paquete con
-- N armados. `committed` = unidades ya vendidas o apartadas por pedidos de este vivo.
CREATE TABLE live_reservations (
  id              text PRIMARY KEY,
  stream_id       text NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  variant_id      text REFERENCES variants(id),
  bundle_id       text REFERENCES bundles(id),
  mode            text NOT NULL CHECK (mode IN ('subasta', 'fijo')),
  qty_reserved    integer NOT NULL CHECK (qty_reserved > 0),
  committed       integer NOT NULL DEFAULT 0 CHECK (committed >= 0),
  start_cents     integer,
  min_cents       integer,
  increment_cents integer,
  price_cents     integer,
  position        integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'on_air', 'done', 'closed')),
  CHECK ((variant_id IS NULL) <> (bundle_id IS NULL)),
  CHECK (committed <= qty_reserved)
);
CREATE INDEX live_reservations_stream ON live_reservations(stream_id, position);
CREATE INDEX live_reservations_variant ON live_reservations(variant_id) WHERE status <> 'closed';
CREATE INDEX live_reservations_bundle ON live_reservations(bundle_id) WHERE status <> 'closed';

CREATE TABLE lots (
  id              text PRIMARY KEY,
  stream_id       text NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  reservation_id  text NOT NULL REFERENCES live_reservations(id) ON DELETE CASCADE,
  lot_no          text NOT NULL,
  mode            text NOT NULL CHECK (mode IN ('subasta', 'fijo')),
  unit_index      integer NOT NULL DEFAULT 1,
  unit_total      integer NOT NULL DEFAULT 1,
  status          text NOT NULL CHECK (status IN ('open', 'sold', 'no_sale', 'closed')),
  start_cents     integer,
  min_cents       integer,
  increment_cents integer,
  price_cents     integer,                    -- puja actual o precio fijo
  winner_id       text REFERENCES users(id),
  bids_count      integer NOT NULL DEFAULT 0,
  sold_qty        integer NOT NULL DEFAULT 0,
  opened_at       timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);
CREATE INDEX lots_stream ON lots(stream_id);

CREATE TABLE bids (
  id           bigserial PRIMARY KEY,
  lot_id       text NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bids_lot ON bids(lot_id);

CREATE TABLE stream_messages (
  id        text PRIMARY KEY,
  stream_id text NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  user_id   text REFERENCES users(id) ON DELETE SET NULL,
  handle    text NOT NULL,
  text      text NOT NULL,
  system    boolean NOT NULL DEFAULT false,
  is_seller boolean NOT NULL DEFAULT false,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stream_messages_stream ON stream_messages(stream_id, at);

-- ------------------------------------------------- pagos y pedidos ---

CREATE TABLE platform_qrs (
  id             text PRIMARY KEY,
  image_key      text NOT NULL,
  bank           text NOT NULL,
  holder         text NOT NULL,
  account        text NOT NULL,
  active         boolean NOT NULL DEFAULT false,
  created_by     text REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  activated_at   timestamptz,
  deactivated_at timestamptz
);
CREATE UNIQUE INDEX platform_qrs_one_active ON platform_qrs(active) WHERE active;

-- Un pago = una transferencia del comprador. Puede cubrir varios pedidos (carrito multivendedor)
-- o un plan Premium.
CREATE TABLE payments (
  id            text PRIMARY KEY,
  ref           text NOT NULL UNIQUE,          -- CM-48211 / PREMIUM-TIENDA-…
  user_id       text NOT NULL REFERENCES users(id),
  kind          text NOT NULL CHECK (kind IN ('orders', 'plan')),
  amount_cents  integer NOT NULL CHECK (amount_cents > 0),
  status        text NOT NULL CHECK (status IN ('pending', 'in_review', 'approved', 'rejected', 'expired')),
  expires_at    timestamptz,
  qr_id         text REFERENCES platform_qrs(id),
  receipt_key   text,
  receipt_at    timestamptz,
  reviewed_by   text REFERENCES users(id),
  reviewed_at   timestamptz,
  reject_reason text,
  plan_seller_id text REFERENCES sellers(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_status ON payments(status, receipt_at);
CREATE INDEX payments_user ON payments(user_id, created_at DESC);

CREATE TABLE payouts (
  id               text PRIMARY KEY,
  seller_id        text NOT NULL REFERENCES sellers(id),
  period_start     date NOT NULL,
  period_end       date NOT NULL,
  scheduled_for    date NOT NULL,
  gross_cents      integer NOT NULL,
  commission_cents integer NOT NULL,
  net_cents        integer NOT NULL,
  orders_count     integer NOT NULL,
  status           text NOT NULL CHECK (status IN ('programada', 'pagada')),
  bank_snapshot    jsonb,
  receipt_key      text,
  operation_number text,
  paid_at          timestamptz,
  paid_by          text REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, period_end)
);

CREATE TABLE orders (
  id               text PRIMARY KEY,
  ref              text NOT NULL UNIQUE,         -- CM-48211-1
  payment_id       text NOT NULL REFERENCES payments(id),
  buyer_id         text NOT NULL REFERENCES users(id),
  seller_id        text NOT NULL REFERENCES sellers(id),
  channel          text NOT NULL CHECK (channel IN ('catalogo', 'vivo', 'subasta')),
  stream_id        text REFERENCES streams(id),
  status           text NOT NULL CHECK (status IN (
                     'pendiente_pago', 'pago_en_revision', 'pagado', 'preparando', 'enviado',
                     'entregado', 'en_reclamo', 'cancelado', 'vencido')),
  subtotal_cents   integer NOT NULL,
  shipping_cents   integer NOT NULL DEFAULT 0,
  total_cents      integer NOT NULL,
  commission_bp    integer NOT NULL,
  commission_cents integer NOT NULL,              -- sobre el subtotal, nunca sobre el envío
  delivery_method  text NOT NULL DEFAULT 'envio' CHECK (delivery_method IN ('envio', 'retiro')),
  shipping_mode    text,                           -- envio_gratis | a_convenir
  address          jsonb,                          -- copia de la dirección al momento de comprar
  phone            text,
  carrier          text,
  tracking         text,
  payout_id        text REFERENCES payouts(id),
  paid_at          timestamptz,
  preparing_at     timestamptz,
  shipped_at       timestamptz,
  delivered_at     timestamptz,
  cancelled_at     timestamptz,
  expired_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_buyer ON orders(buyer_id, created_at DESC);
CREATE INDEX orders_seller ON orders(seller_id, status, created_at DESC);
CREATE INDEX orders_payment ON orders(payment_id);
CREATE INDEX orders_payout ON orders(payout_id);

CREATE TABLE order_items (
  id               text PRIMARY KEY,
  order_id         text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id       text REFERENCES variants(id),
  bundle_id        text REFERENCES bundles(id),
  product_id       text REFERENCES products(id),
  title            text NOT NULL,
  variant_label    text,
  photo_key        text,
  color            text,
  qty              integer NOT NULL CHECK (qty > 0),
  unit_price_cents integer NOT NULL,
  reservation_id   text REFERENCES live_reservations(id),
  lot_id           text REFERENCES lots(id)
);
CREATE INDEX order_items_order ON order_items(order_id);

-- Unidades apartadas por pedidos sin pagar. Se liberan al confirmar el pago (pasan a vendidas),
-- al vencer o al cancelar. Para un paquete se crea una fila por pieza.
CREATE TABLE stock_holds (
  id             text PRIMARY KEY,
  variant_id     text NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  order_id       text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  qty            integer NOT NULL CHECK (qty > 0),
  reservation_id text REFERENCES live_reservations(id),
  expires_at     timestamptz NOT NULL,
  released_at    timestamptz,
  release_reason text CHECK (release_reason IN ('pagado', 'vencido', 'cancelado')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_holds_active ON stock_holds(variant_id) WHERE released_at IS NULL;
CREATE INDEX stock_holds_order ON stock_holds(order_id);

CREATE TABLE stock_movements (
  id         bigserial PRIMARY KEY,
  variant_id text NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN (
               'alta', 'reposicion', 'correccion', 'perdida', 'venta', 'apartado',
               'pedido_vencido', 'pedido_cancelado', 'reserva_vivo', 'devolucion_vivo')),
  qty        integer NOT NULL,                  -- positivo o negativo según el movimiento
  stock_after integer,
  ref        text,
  note       text,
  actor_id   text REFERENCES users(id) ON DELETE SET NULL,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_variant ON stock_movements(variant_id, at DESC);

CREATE TABLE order_events (
  id       bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status   text NOT NULL,
  note     text,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order ON order_events(order_id, at);

CREATE TABLE claims (
  id                 text PRIMARY KEY,
  order_id           text NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id           text NOT NULL REFERENCES users(id),
  reason             text NOT NULL CHECK (reason IN ('no_llego', 'danado', 'no_es_lo_que_compre', 'otro')),
  description        text,
  photo_keys         text[] NOT NULL DEFAULT ARRAY[]::text[],
  status             text NOT NULL DEFAULT 'abierto' CHECK (status IN (
                       'abierto', 'esperando_vendedor', 'resuelto_comprador', 'resuelto_vendedor')),
  previous_status    text NOT NULL,             -- estado del pedido antes del reclamo
  resolution_note    text,
  refund_cents       integer,
  refund_receipt_key text,
  resolved_by        text REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz
);

CREATE TABLE reviews (
  id         text PRIMARY KEY,
  order_id   text NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  seller_id  text NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  buyer_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id text REFERENCES products(id) ON DELETE SET NULL,
  rating     integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    text,
  photo_key  text,
  reply      text,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_seller ON reviews(seller_id, created_at DESC);
CREATE INDEX reviews_product ON reviews(product_id);

CREATE TABLE plan_subscriptions (
  id           text PRIMARY KEY,
  seller_id    text NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  plan         text NOT NULL CHECK (plan IN ('premium')),
  amount_cents integer NOT NULL,
  payment_id   text REFERENCES payments(id),
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  activated_by text REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------- mensajes y avisos ---

CREATE TABLE messages (
  id        text PRIMARY KEY,
  buyer_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id text NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  sender    text NOT NULL CHECK (sender IN ('buyer', 'seller', 'system')),
  text      text NOT NULL,
  order_id  text REFERENCES orders(id) ON DELETE SET NULL,
  read_at   timestamptz,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_thread ON messages(seller_id, buyer_id, at);

CREATE TABLE notifications (
  id        text PRIMARY KEY,
  user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind      text NOT NULL,
  title     text NOT NULL,
  body      text NOT NULL,
  link      text,
  group_key text,
  count     integer NOT NULL DEFAULT 1,
  read      boolean NOT NULL DEFAULT false,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user ON notifications(user_id, at DESC);

CREATE TABLE reports (
  id             text PRIMARY KEY,
  by_user_id     text REFERENCES users(id) ON DELETE SET NULL,
  target_user_id text REFERENCES users(id) ON DELETE SET NULL,
  target_handle  text,
  product_id     text REFERENCES products(id) ON DELETE SET NULL,
  stream_id      text REFERENCES streams(id) ON DELETE SET NULL,
  text           text,
  reason         text NOT NULL,
  status         text NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto', 'resuelto', 'descartado')),
  resolved_by    text REFERENCES users(id),
  at             timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------- contenido y ajustes ---

CREATE TABLE banners (
  id          text PRIMARY KEY,
  image_key   text NOT NULL,
  title       text NOT NULL,
  cta         text NOT NULL DEFAULT 'Ver colección',
  target_type text NOT NULL CHECK (target_type IN ('producto', 'categoria', 'vendedor', 'vivo', 'link')),
  target_id   text,
  position    integer NOT NULL DEFAULT 0,
  starts_at   timestamptz,
  ends_at     timestamptz,
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE featured (
  kind     text NOT NULL CHECK (kind IN ('producto', 'vendedor')),
  ref_id   text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, ref_id)
);

CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by text REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id        bigserial PRIMARY KEY,
  actor_id  text REFERENCES users(id) ON DELETE SET NULL,
  action    text NOT NULL,
  entity    text NOT NULL,
  entity_id text,
  data      jsonb,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_at ON audit_log(at DESC);

CREATE SEQUENCE payment_ref_seq START 48200;
CREATE SEQUENCE lot_no_seq START 1;

-- ------------------------------------------------- disponibilidad ---

-- Unidades de una variante comprometidas en vivos activos y todavía no vendidas ni apartadas.
-- Cuenta reservas directas de la variante y las piezas de paquetes cargados.
CREATE FUNCTION live_reserved(v text) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT SUM(r.qty_reserved - r.committed)
    FROM live_reservations r JOIN streams s ON s.id = r.stream_id
    WHERE r.variant_id = v AND r.status <> 'closed' AND s.status = 'live'), 0)
  + COALESCE((
    SELECT SUM((r.qty_reserved - r.committed) * bi.qty)
    FROM live_reservations r
    JOIN streams s ON s.id = r.stream_id
    JOIN bundle_items bi ON bi.bundle_id = r.bundle_id
    WHERE bi.variant_id = v AND r.status <> 'closed' AND s.status = 'live'), 0)
$$;

CREATE FUNCTION held_by_orders(v text) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(qty), 0)::integer FROM stock_holds WHERE variant_id = v AND released_at IS NULL
$$;

-- La única fórmula de disponible del sistema: stock − apartado − en vivo.
CREATE FUNCTION stock_available(v text) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT GREATEST(0, (SELECT stock FROM variants WHERE id = v) - held_by_orders(v) - live_reserved(v))::integer
$$;
