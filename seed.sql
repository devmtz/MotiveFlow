-- ===========================================================================
--  MotiveFlow — Database Seed Script
--  File: database/seed.sql
--  Version: 1.0.0
--
--  HOW TO USE:
--  1. Make sure schema.sql has already been executed first.
--  2. Open Supabase Dashboard → SQL Editor
--  3. Paste this script and click "Run"
--
--  IMAGE NAMING CONVENTION:
--  ────────────────────────────────────────────────────────────────────────────
--  ❌ BAD  (causes ERR_FILE_NOT_FOUND):  "logo kia(1).png", "Filtre Huile.jpg"
--  ✅ GOOD (clean, URL-safe):            "kia-logo.png",    "filtre-huile-kia.jpg"
--
--  Rules:
--    • Lowercase letters only
--    • Hyphens (-) instead of spaces or underscores
--    • No parentheses, accents, or special characters
--    • Format: {brand}-{part-type}-{optional-detail}.{ext}
--    • Examples: kia-disque-frein-avant.jpg
--                hyundai-filtre-huile-i10.jpg
--                kia-bougie-allumage.jpg
--
--  STORAGE SETUP:
--    1. Supabase Dashboard → Storage → Create Bucket → "product-images" (Public)
--    2. Upload images with the clean filenames above
--    3. The image_url below stores only the FILE PATH (not the full URL)
--       The JS function getStorageUrl('product-images', product.image_url)
--       builds the full URL at render time automatically.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- STEP 1: BRANDS — Kia & Hyundai
-- ---------------------------------------------------------------------------
-- نستخدم INSERT ... ON CONFLICT DO NOTHING لتجنب أخطاء التكرار عند إعادة التشغيل

INSERT INTO public.brands (name, slug, logo_url, country, is_active)
VALUES
  (
    'Kia',
    'kia',
    'brands/kia-logo.png',          -- ✅ Clean filename: lowercase + hyphens
    'South Korea',
    TRUE
  ),
  (
    'Hyundai',
    'hyundai',
    'brands/hyundai-logo.png',       -- ✅ Clean filename
    'South Korea',
    TRUE
  )
ON CONFLICT (slug) DO NOTHING;      -- Safe to re-run: skips if already exists


-- ---------------------------------------------------------------------------
-- STEP 2: CATEGORIES — Engine, Filters, Braking System
-- ---------------------------------------------------------------------------
-- الفئات الأساسية التي تستخدمها فلاتر الكتالوج (data-filter="engine", etc.)
-- slug يجب أن يطابق تماماً قيم data-filter في index.html

INSERT INTO public.categories (name, slug, description, is_active)
VALUES
  (
    'Moteur',                        -- اسم الفئة (بالفرنسية لتتوافق مع واجهة الموقع)
    'engine',                        -- ← يطابق data-filter="engine" في index.html ✅
    'Pièces moteur : pistons, segments, arbres à cames, joints de culasse, etc.',
    TRUE
  ),
  (
    'Filtres',
    'filters',                       -- ← يطابق data-filter="filters" في index.html ✅
    'Filtres à huile, à air, à carburant et à habitacle pour tous modèles.',
    TRUE
  ),
  (
    'Freinage',
    'brakes',                        -- ← يطابق data-filter="brakes" في index.html ✅
    'Disques, plaquettes, étriers et flexibles de frein certifiés OEM.',
    TRUE
  ),
  (
    'Suspension',
    'suspension',                    -- ← data-filter="suspension" ✅
    'Amortisseurs, rotules, biellettes de barre stabilisatrice et silent-blocs.',
    TRUE
  ),
  (
    'Électricité',
    'electrical',                    -- ← data-filter="electrical" ✅
    'Alternateurs, démarreurs, bougies, capteurs et câblage.',
    TRUE
  )
ON CONFLICT (slug) DO NOTHING;


-- ===========================================================================
-- STEP 3: PRODUCTS — 5 Sample Products (Kia & Hyundai)
-- ===========================================================================
-- نستخدم CTE (Common Table Expression) لجلب IDs تلقائيًا بدلاً من hardcoding UUID

-- ─── TEMPLATE EXPLAINED ────────────────────────────────────────────────────
-- category_id : يُجلب تلقائيًا من جدول categories بواسطة الـ slug
-- brand_name  : اسم الشركة المصنّعة للقطعة (ليس العلامة التجارية للسيارة)
--               مثال: "OEM Kia" أو "Bosch" أو "Aisin"
-- sku         : رقم القطعة الأصلي (OEM Reference) — فريد لكل منتج
-- image_url   : المسار فقط داخل الـ bucket (بدون الـ URL الكامل)
--               دالة getStorageUrl() في JS ستبني الرابط الكامل تلقائيًا
-- compare_price: السعر الأصلي قبل الخصم (اختياري — يظهر مشطوبًا في الكارد)
-- is_featured : TRUE → يظهر أولاً في الكتالوج بشريط "Vedette"
-- ────────────────────────────────────────────────────────────────────────────

WITH
  cat_engine     AS (SELECT id FROM public.categories WHERE slug = 'engine'     LIMIT 1),
  cat_filters    AS (SELECT id FROM public.categories WHERE slug = 'filters'    LIMIT 1),
  cat_brakes     AS (SELECT id FROM public.categories WHERE slug = 'brakes'     LIMIT 1)

INSERT INTO public.products
  (category_id, name, slug, description, sku, brand_name,
   price, compare_price, stock_quantity, image_url, is_active, is_featured)
VALUES

  -- ── Produit 1 : Joint de Culasse Kia Sportage (FEATURED) ─────────────────
  (
    (SELECT id FROM cat_engine),
    'Joint de Culasse — Kia Sportage 2.0i (2018–2022)',
    'joint-culasse-kia-sportage-2-0i-2018-2022',
    'Joint de culasse OEM d''origine Kia pour moteur G4NA 2.0L. '
    'Matériau multicouche haute résistance. Garantit l''étanchéité parfaite '
    'entre le bloc moteur et la culasse. Compatible : Sportage IV, Ceed II.',
    'KIA-22311-2E001',               -- ✅ OEM Part Number (SKU)
    'OEM Kia',
    189.900,                         -- Prix en TND (3 décimales = format tunisien)
    229.500,                         -- compare_price → affiché barré dans le card
    12,                              -- stock_quantity
    'products/kia-joint-culasse-sportage.jpg',  -- ✅ clean filename
    TRUE,
    TRUE                             -- is_featured = TRUE → apparaît en premier
  ),

  -- ── Produit 2 : Filtre à Huile Hyundai i10 ───────────────────────────────
  (
    (SELECT id FROM cat_filters),
    'Filtre à Huile — Hyundai i10 1.0 / 1.2 (2014–2023)',
    'filtre-huile-hyundai-i10-2014-2023',
    'Filtre à huile moteur d''origine Hyundai pour les moteurs G3LA (1.0L) '
    'et G4LA (1.2L). Filtration haute efficacité 99.5%. Cartouche à visser '
    'standard. Remplacement recommandé tous les 10 000 km.',
    'HYU-26300-35503',
    'OEM Hyundai',
    18.500,
    NULL,                            -- Pas de remise → compare_price = NULL
    85,
    'products/hyundai-filtre-huile-i10.jpg',   -- ✅ clean filename
    TRUE,
    FALSE
  ),

  -- ── Produit 3 : Plaquettes de Frein Avant Kia Rio ────────────────────────
  (
    (SELECT id FROM cat_brakes),
    'Plaquettes de Frein Avant — Kia Rio IV 1.4 (2017–2022)',
    'plaquettes-frein-avant-kia-rio-iv-2017-2022',
    'Kit de 4 plaquettes de frein avant OEM pour Kia Rio IV (DC) moteur '
    'G4LC 1.4L MPI. Matériau semi-métallique, faible poussière. '
    'Inclut les ressorts d''anti-crissement. Compatible aussi : Hyundai Accent IV.',
    'KIA-58101-H8A20',
    'OEM Kia',
    98.000,
    119.000,
    28,
    'products/kia-plaquettes-frein-avant-rio.jpg',
    TRUE,
    FALSE
  ),

  -- ── Produit 4 : Filtre à Air Hyundai Tucson ──────────────────────────────
  (
    (SELECT id FROM cat_filters),
    'Filtre à Air Moteur — Hyundai Tucson 2.0 CRDi (2015–2021)',
    'filtre-air-hyundai-tucson-2-0-crdi-2015-2021',
    'Filtre à air OEM d''origine Hyundai pour moteur D4HA 2.0L CRDi 136ch. '
    'Capacité de filtration des particules PM2.5. Remplacement tous les 30 000 km '
    'ou 2 ans. Compatible : Tucson III (TL), ix35 restylé.',
    'HYU-28113-2S000',
    'OEM Hyundai',
    45.000,
    NULL,
    43,
    'products/hyundai-filtre-air-tucson-crdi.jpg',
    TRUE,
    FALSE
  ),

  -- ── Produit 5 : Disques de Frein Avant Kia Ceed (FEATURED) ───────────────
  (
    (SELECT id FROM cat_brakes),
    'Disques de Frein Avant — Kia Ceed ED / JD (2006–2018)',
    'disques-frein-avant-kia-ceed-ed-jd-2006-2018',
    'Paire de disques de frein avant ventilés OEM Brembo pour Kia Ceed '
    'générations ED et JD. Diamètre 280mm, épaisseur 26mm. '
    'Traitement anti-rouille Geomet®. Livré par paire (2 disques). '
    'Compatible : Ceed Sportswagon, ProCeed.',
    'KIA-51712-A6100',
    'Brembo',
    285.000,
    320.000,
    7,                               -- Stock faible → badge "Dernières pièces"
    'products/kia-disques-frein-avant-ceed.jpg',
    TRUE,
    TRUE                             -- is_featured = TRUE
  )

ON CONFLICT (slug) DO NOTHING;      -- Idempotent — safe to re-run


-- ===========================================================================
-- VERIFICATION QUERIES — Run after insert to confirm data
-- ===========================================================================
-- Uncomment to verify (paste separately in SQL Editor):

/*
-- Check brands were inserted:
SELECT id, name, slug, logo_url FROM public.brands ORDER BY name;

-- Check categories:
SELECT id, name, slug FROM public.categories ORDER BY name;

-- Check products with their category name (the JOIN your JS uses):
SELECT
  p.name,
  p.sku,
  p.price,
  p.compare_price,
  p.stock_quantity,
  p.is_featured,
  p.image_url,
  c.name  AS category_name,
  c.slug  AS category_slug
FROM public.products p
JOIN public.categories c ON c.id = p.category_id
ORDER BY p.is_featured DESC, p.created_at DESC;
*/


-- ===========================================================================
-- IMAGE URL REFERENCE — How image_url Values Work in JS
-- ===========================================================================
--
--  The `image_url` column stores ONLY the file path inside the bucket:
--    e.g.  'products/kia-joint-culasse-sportage.jpg'
--
--  In js/supabase.js, the renderProducts() function calls getStorageUrl():
--
--    src="${getStorageUrl('product-images', product.image_url)}"
--
--  Which builds the full public URL:
--    https://vdyjoxqscvuzunmllpzi.supabase.co/storage/v1/object/public/
--    product-images/products/kia-joint-culasse-sportage.jpg
--
--  ⚠️  FILE NAMING — REQUIRED before uploading to Supabase Storage:
--
--    RENAME your files using this command (Linux/Crostini terminal):
--
--    # Navigate to your images folder:
--    cd ~/MotiveFlow/img/brands
--
--    # Rename problem files (spaces → hyphens, remove parens, lowercase):
--    mv "logo kia(1).png"   "kia-logo.png"
--    mv "logo hy1.png"      "hyundai-logo.png"
--    mv "logo ford(1).png"  "ford-logo.png"
--    mv "logo ty (1).png"   "toyota-logo.png"
--    mv "logo mz (1).png"   "mazda-logo.png"
--    mv "logo is (1).png"   "isuzu-logo.png"
--    mv "logo sz1.png"      "suzuki-logo.png"
--    mv "logo nis.png"      "nissan-logo.png"
--
--  Then update the <img src="..."> paths in index.html to use the new names.
--
-- ===========================================================================
