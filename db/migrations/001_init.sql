-- Portable PostgreSQL baseline for normalized retailer data and idempotent ingestion.
-- Raw XML files belong in object storage or a mounted fixture directory; this schema stores
-- the provenance needed to reproduce and safely replace normalized records.

BEGIN;

CREATE TABLE IF NOT EXISTS chains (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL REFERENCES chains(id),
  retailer_store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  latitude NUMERIC(9, 6),
  longitude NUMERIC(9, 6),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source_file_id TEXT,
  source_published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, retailer_store_id),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  barcode TEXT,
  name_he TEXT NOT NULL,
  brand TEXT,
  manufacturer TEXT,
  description TEXT,
  quantity NUMERIC,
  unit_of_measure TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique
  ON products (barcode) WHERE barcode IS NOT NULL AND barcode <> '';

CREATE TABLE IF NOT EXISTS store_products (
  chain_id TEXT NOT NULL REFERENCES chains(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  retailer_item_id TEXT NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_weighted BOOLEAN NOT NULL DEFAULT FALSE,
  source_file_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, store_id, retailer_item_id)
);

CREATE INDEX IF NOT EXISTS store_products_product_idx ON store_products (product_id, store_id);

CREATE TABLE IF NOT EXISTS prices (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL REFERENCES chains(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  product_id TEXT REFERENCES products(id),
  retailer_item_id TEXT NOT NULL,
  price_nis NUMERIC(12, 4) NOT NULL CHECK (price_nis >= 0),
  unit_price_nis NUMERIC(12, 4) CHECK (unit_price_nis IS NULL OR unit_price_nis >= 0),
  unit_of_measure TEXT,
  quantity NUMERIC CHECK (quantity IS NULL OR quantity > 0),
  is_available BOOLEAN,
  is_weighted BOOLEAN,
  observed_at TIMESTAMPTZ NOT NULL,
  source_file_id TEXT NOT NULL,
  source_checksum TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, store_id, retailer_item_id, observed_at, source_checksum)
);

CREATE UNIQUE INDEX IF NOT EXISTS prices_current_unique
  ON prices (chain_id, store_id, retailer_item_id) WHERE is_current;

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL REFERENCES chains(id),
  store_id TEXT REFERENCES stores(id),
  retailer_promotion_id TEXT NOT NULL,
  description TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  minimum_quantity NUMERIC CHECK (minimum_quantity IS NULL OR minimum_quantity > 0),
  discount_nis NUMERIC(12, 4) CHECK (discount_nis IS NULL OR discount_nis >= 0),
  discount_percent NUMERIC(7, 4) CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100),
  promotional_price_nis NUMERIC(12, 4) CHECK (promotional_price_nis IS NULL OR promotional_price_nis >= 0),
  club_id TEXT,
  is_club_only BOOLEAN NOT NULL DEFAULT FALSE,
  source_file_id TEXT NOT NULL,
  source_checksum TEXT NOT NULL,
  UNIQUE (chain_id, store_id, retailer_promotion_id, source_checksum)
);

CREATE TABLE IF NOT EXISTS promotion_items (
  promotion_id TEXT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  retailer_item_id TEXT NOT NULL,
  product_id TEXT REFERENCES products(id),
  PRIMARY KEY (promotion_id, retailer_item_id)
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  run_key TEXT PRIMARY KEY,
  retailer_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingestion_documents (
  source_file_id TEXT PRIMARY KEY,
  run_key TEXT NOT NULL REFERENCES ingestion_runs(run_key),
  retailer_id TEXT NOT NULL,
  document_kind TEXT NOT NULL,
  uri TEXT NOT NULL,
  file_name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  downloaded_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed', 'skipped')),
  record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  failure JSONB,
  UNIQUE (source_file_id, checksum)
);

CREATE INDEX IF NOT EXISTS stores_location_idx ON stores (latitude, longitude);
CREATE INDEX IF NOT EXISTS prices_current_lookup_idx ON prices (store_id, product_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS promotions_active_idx ON promotions (store_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS ingestion_runs_status_idx ON ingestion_runs (retailer_id, status, started_at DESC);

COMMIT;
