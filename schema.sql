-- ===========================================================================
--  MotiveFlow — PostgreSQL / Supabase Database Schema
--  Version : 1.0.0
--  Author  : Senior Database Architect
--  Date    : 2026-04-20
-- ===========================================================================
--
--  HOW TO USE:
--  1. Open your Supabase project → SQL Editor
--  2. Paste this entire script and click "Run"
--  3. All tables, policies, indexes, and triggers will be created in order.
--
--  EXECUTION ORDER (dependency-safe):
--    Extensions → Helper Function & Trigger → Core Tables → Junction/Transactional Tables → Indexes → RLS Policies
--
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------------
-- Enable uuid generation. Already available in Supabase by default,
-- but we ensure it exists before using uuid_generate_v4().
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ---------------------------------------------------------------------------
-- 1. REUSABLE TRIGGER FUNCTION — Auto-update `updated_at`
-- ---------------------------------------------------------------------------
-- A single PL/pgSQL function shared by ALL tables that have an updated_at
-- column. One trigger per table will call this function on every UPDATE.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ===========================================================================
--  TABLE DEFINITIONS
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 2. PROFILES
-- ---------------------------------------------------------------------------
-- Extends Supabase auth.users with additional user-specific data.
-- Each row is 1-to-1 with auth.users and owned exclusively by that user.
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),       -- Same UUID as auth.users.id
  user_id       UUID NOT NULL UNIQUE REFERENCES auth.users(id)    -- FK → Supabase auth
                ON DELETE CASCADE,
  full_name     TEXT,
  phone         VARCHAR(20),
  avatar_url    TEXT,
  address       TEXT,
  city          VARCHAR(100),
  country       VARCHAR(100) DEFAULT 'TN',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Extended public profile data for each authenticated user.';
COMMENT ON COLUMN public.profiles.user_id IS 'References auth.users.id — 1-to-1 relationship.';

-- Trigger: keep updated_at fresh
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 3. CATEGORIES
-- ---------------------------------------------------------------------------
-- Top-level catalog groupings (Engine, Brakes, Suspension, Body, …).
-- Supports optional self-referential parent for nested sub-categories.
CREATE TABLE IF NOT EXISTS public.categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  slug        VARCHAR(120) NOT NULL UNIQUE,               -- URL-friendly identifier
  description TEXT,
  icon_url    TEXT,                                        -- Optional category icon/image
  parent_id   UUID REFERENCES public.categories(id)       -- Nullable → supports sub-categories
              ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.categories IS 'Auto-parts catalog categories (Engine, Brakes, Suspension, etc.).';

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 4. BRANDS
-- ---------------------------------------------------------------------------
-- Car manufacturers / OEM brands (Toyota, Hyundai, Renault, …).
CREATE TABLE IF NOT EXISTS public.brands (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  slug        VARCHAR(120) NOT NULL UNIQUE,
  logo_url    TEXT,
  country     VARCHAR(100),                               -- Country of origin
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.brands IS 'Car manufacturers — used for VIN lookup and product compatibility.';

CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 5. CAR MODELS
-- ---------------------------------------------------------------------------
-- Specific models belonging to a brand, with production year range.
CREATE TABLE IF NOT EXISTS public.car_models (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id        UUID NOT NULL REFERENCES public.brands(id)
                  ON DELETE CASCADE,
  name            VARCHAR(150) NOT NULL,                   -- e.g. "Corolla", "Clio III"
  slug            VARCHAR(180) NOT NULL UNIQUE,
  year_start      SMALLINT NOT NULL                        -- First production year
                  CHECK (year_start >= 1900),
  year_end        SMALLINT                                 -- NULL = still in production
                  CHECK (year_end IS NULL OR year_end >= year_start),
  engine_types    TEXT[],                                  -- e.g. ARRAY['1.4i','1.6 TDI']
  body_type       VARCHAR(50),                             -- Sedan, SUV, Hatchback, …
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.car_models IS 'Vehicle models per brand with their production year range.';
COMMENT ON COLUMN public.car_models.year_end IS 'NULL means the model is still being produced.';

CREATE TRIGGER trg_car_models_updated_at
  BEFORE UPDATE ON public.car_models
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 6. PRODUCTS
-- ---------------------------------------------------------------------------
-- Inventory of auto parts available for sale.
CREATE TABLE IF NOT EXISTS public.products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id     UUID NOT NULL REFERENCES public.categories(id)
                  ON DELETE RESTRICT,
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(280) NOT NULL UNIQUE,
  description     TEXT,
  sku             VARCHAR(100) UNIQUE,                     -- Stock-Keeping Unit / OEM reference
  brand_name      VARCHAR(100),                            -- Part manufacturer brand (e.g. Bosch)
  price           NUMERIC(10, 2) NOT NULL
                  CHECK (price >= 0),
  compare_price   NUMERIC(10, 2)                           -- Optional original price for discounts
                  CHECK (compare_price IS NULL OR compare_price >= price),
  stock_quantity  INTEGER NOT NULL DEFAULT 0
                  CHECK (stock_quantity >= 0),
  image_url       TEXT,
  images          TEXT[],                                  -- Array of additional image URLs
  weight_kg       NUMERIC(6, 3),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.products IS 'Auto-parts product catalog with pricing and inventory data.';
COMMENT ON COLUMN public.products.compare_price IS 'Original price shown crossed-out when a discount applies.';

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 7. PRODUCT COMPATIBILITY  (Many-to-Many Junction)
-- ---------------------------------------------------------------------------
-- Links a product to every car_model it is compatible with.
-- A single part can fit many models; a model can use many parts.
CREATE TABLE IF NOT EXISTS public.product_compatibility (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id    UUID NOT NULL REFERENCES public.products(id)   ON DELETE CASCADE,
  car_model_id  UUID NOT NULL REFERENCES public.car_models(id) ON DELETE CASCADE,
  notes         TEXT,                                          -- e.g. "Fits diesel variants only"
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, car_model_id)                           -- No duplicate pairings
);

COMMENT ON TABLE public.product_compatibility IS 'Many-to-Many junction: which products fit which car models.';

CREATE TRIGGER trg_product_compatibility_updated_at
  BEFORE UPDATE ON public.product_compatibility
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 8. ORDERS
-- ---------------------------------------------------------------------------
-- A customer's purchase transaction header.
CREATE TABLE IF NOT EXISTS public.orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id)
                    ON DELETE RESTRICT,
  status            VARCHAR(30) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
  total_amount      NUMERIC(10, 2) NOT NULL
                    CHECK (total_amount >= 0),
  shipping_address  JSONB,                                  -- Snapshot of address at order time
  payment_method    VARCHAR(50),
  payment_status    VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                    CHECK (payment_status IN ('unpaid','paid','failed','refunded')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.orders IS 'Customer order headers — one row per transaction.';
COMMENT ON COLUMN public.orders.shipping_address IS 'JSONB snapshot of the delivery address, preserved even if the profile changes.';

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 9. ORDER ITEMS
-- ---------------------------------------------------------------------------
-- Individual line items belonging to an order.
CREATE TABLE IF NOT EXISTS public.order_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id      UUID NOT NULL REFERENCES public.orders(id)   ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity      INTEGER NOT NULL
                CHECK (quantity > 0),
  unit_price    NUMERIC(10, 2) NOT NULL                      -- Price snapshot at order time
                CHECK (unit_price >= 0),
  subtotal      NUMERIC(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.order_items IS 'Line items within an order — quantity × price snapshot.';
COMMENT ON COLUMN public.order_items.unit_price IS 'Snapshot of the product price at purchase time.';
COMMENT ON COLUMN public.order_items.subtotal IS 'Auto-computed generated column: quantity × unit_price.';

CREATE TRIGGER trg_order_items_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 10. VIN LOOKUPS
-- ---------------------------------------------------------------------------
-- Logs and caches successful VIN decode results to reduce repeated API calls.
-- On a cache hit (same VIN requested again), return data from here instantly.
CREATE TABLE IF NOT EXISTS public.vin_lookups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES auth.users(id)            -- NULL for anonymous lookups
                  ON DELETE SET NULL,
  vin             CHAR(17) NOT NULL,                         -- VINs are always 17 characters
  decoded_data    JSONB NOT NULL,                            -- Full API response payload
  make            VARCHAR(100),                              -- Denormalized for quick filtering
  model           VARCHAR(150),
  year            SMALLINT,
  trim_level      VARCHAR(100),
  engine          VARCHAR(100),
  source_api      VARCHAR(80) DEFAULT 'NHTSA',               -- Which API provided the data
  is_cached       BOOLEAN NOT NULL DEFAULT FALSE,            -- TRUE once re-used as a cache hit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.vin_lookups IS 'Cache layer for VIN decode API results — avoids duplicate API calls.';
COMMENT ON COLUMN public.vin_lookups.vin IS 'Standard 17-character Vehicle Identification Number.';
COMMENT ON COLUMN public.vin_lookups.decoded_data IS 'Full JSON payload returned by the external VIN decode API.';

-- Unique partial index: only one cached record per VIN (de-duplicates API results)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vin_lookups_vin_unique
  ON public.vin_lookups (vin);

CREATE TRIGGER trg_vin_lookups_updated_at
  BEFORE UPDATE ON public.vin_lookups
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ===========================================================================
--  PERFORMANCE INDEXES
-- ===========================================================================

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_user_id       ON public.profiles (user_id);

-- categories
CREATE INDEX IF NOT EXISTS idx_categories_parent_id   ON public.categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug        ON public.categories (slug);

-- brands
CREATE INDEX IF NOT EXISTS idx_brands_slug            ON public.brands (slug);

-- car_models
CREATE INDEX IF NOT EXISTS idx_car_models_brand_id    ON public.car_models (brand_id);
CREATE INDEX IF NOT EXISTS idx_car_models_slug        ON public.car_models (slug);

-- products
CREATE INDEX IF NOT EXISTS idx_products_category_id   ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug          ON public.products (slug);
CREATE INDEX IF NOT EXISTS idx_products_is_active     ON public.products (is_active);
CREATE INDEX IF NOT EXISTS idx_products_is_featured   ON public.products (is_featured);
-- Full-text search on product name and description
CREATE INDEX IF NOT EXISTS idx_products_fts
  ON public.products
  USING GIN (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));

-- product_compatibility
CREATE INDEX IF NOT EXISTS idx_compat_product_id      ON public.product_compatibility (product_id);
CREATE INDEX IF NOT EXISTS idx_compat_car_model_id    ON public.product_compatibility (car_model_id);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_user_id         ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status          ON public.orders (status);

-- order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);

-- vin_lookups
CREATE INDEX IF NOT EXISTS idx_vin_lookups_user_id    ON public.vin_lookups (user_id);
CREATE INDEX IF NOT EXISTS idx_vin_lookups_make       ON public.vin_lookups (make);


-- ===========================================================================
--  ROW LEVEL SECURITY (RLS)
-- ===========================================================================
-- Strategy:
--   PUBLIC  tables (catalog data) → anyone can SELECT; only service_role can mutate.
--   PRIVATE tables (user data)    → authenticated owner can SELECT / INSERT / UPDATE.
-- ===========================================================================

-- Enable RLS on every table
ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.car_models             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_compatibility  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vin_lookups            ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- RLS :: PROFILES  (private — owner only)
-- ---------------------------------------------------------------------------
CREATE POLICY "profiles: owner can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "profiles: owner can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles: owner can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Note: Deletes are routed through auth.users CASCADE — no explicit policy needed.


-- ---------------------------------------------------------------------------
-- RLS :: CATEGORIES  (public read, admin-only writes)
-- ---------------------------------------------------------------------------
CREATE POLICY "categories: public read"
  ON public.categories FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);

-- Writes are intentionally left to service_role (Supabase admin) only.
-- No INSERT/UPDATE/DELETE policies for anon or authenticated roles.


-- ---------------------------------------------------------------------------
-- RLS :: BRANDS  (public read, admin-only writes)
-- ---------------------------------------------------------------------------
CREATE POLICY "brands: public read"
  ON public.brands FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);


-- ---------------------------------------------------------------------------
-- RLS :: CAR MODELS  (public read, admin-only writes)
-- ---------------------------------------------------------------------------
CREATE POLICY "car_models: public read"
  ON public.car_models FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);


-- ---------------------------------------------------------------------------
-- RLS :: PRODUCTS  (public read, admin-only writes)
-- ---------------------------------------------------------------------------
CREATE POLICY "products: public read"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);


-- ---------------------------------------------------------------------------
-- RLS :: PRODUCT COMPATIBILITY  (public read, admin-only writes)
-- ---------------------------------------------------------------------------
CREATE POLICY "product_compatibility: public read"
  ON public.product_compatibility FOR SELECT
  TO anon, authenticated
  USING (TRUE);


-- ---------------------------------------------------------------------------
-- RLS :: ORDERS  (private — owner only)
-- ---------------------------------------------------------------------------
CREATE POLICY "orders: owner can view own orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "orders: owner can insert own order"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "orders: owner can update own order"
  ON public.orders FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- RLS :: ORDER ITEMS  (private — owner via order join)
-- ---------------------------------------------------------------------------
CREATE POLICY "order_items: owner can view own items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "order_items: owner can insert items into own order"
  ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "order_items: owner can update items in own order"
  ON public.order_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- RLS :: VIN LOOKUPS  (private — owner can view/insert; anonymous allowed for insert)
-- ---------------------------------------------------------------------------
-- Allow authenticated users to read their own past lookups
CREATE POLICY "vin_lookups: owner can view own lookups"
  ON public.vin_lookups FOR SELECT
  USING (auth.uid() = user_id);

-- Allow authenticated users to insert a lookup linked to themselves
CREATE POLICY "vin_lookups: authenticated user can insert"
  ON public.vin_lookups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow anonymous users to insert a lookup with no user_id (untracked)
CREATE POLICY "vin_lookups: anon user can insert (no user_id)"
  ON public.vin_lookups FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);


-- ===========================================================================
--  AUTO-CREATE PROFILE ON SIGNUP  (Optional but recommended)
-- ===========================================================================
-- When a new user signs up, automatically create a skeleton profile row.
-- This avoids a missing profile when the user first loads the dashboard.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;   -- Safe re-run if trigger fires twice
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ===========================================================================
--  END OF SCRIPT
-- ===========================================================================
--
--  Tables created (9):
--    1. profiles
--    2. categories
--    3. brands
--    4. car_models
--    5. products
--    6. product_compatibility
--    7. orders
--    8. order_items
--    9. vin_lookups
--
--  Shared functions & triggers:
--    • handle_updated_at()    — auto-refreshes updated_at on every UPDATE
--    • handle_new_user()      — auto-creates profile row on signup
--
--  Row Level Security:
--    • Catalog tables (categories, brands, car_models, products,
--      product_compatibility) → public SELECT via anon + authenticated
--    • User-owned tables (profiles, orders, order_items, vin_lookups)
--      → restricted to auth.uid() owner only
--
-- ===========================================================================
