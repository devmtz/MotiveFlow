// =============================================================================
//  MotiveFlow — Supabase Integration Module
//  File: js/supabase.js
//
//  SETUP INSTRUCTIONS:
//  1. Replace SUPABASE_URL and SUPABASE_ANON_KEY below with your project values.
//     Find them in: Supabase Dashboard → Project Settings → API
//  2. Make sure the Supabase CDN <script> tag is loaded in index.html BEFORE
//     this file (see index.html changes).
//
//  HOW IT WORKS:
//  ┌─────────────────────────────────────────────────────────┐
//  │  DOMContentLoaded                                       │
//  │       ↓                                                 │
//  │  showSkeletons()   ← renders placeholder cards         │
//  │       ↓                                                 │
//  │  fetchProducts()   ← async Supabase query (+ join)     │
//  │       ↓                                                 │
//  │  renderProducts()  ← injects real cards into DOM       │
//  │       ↓  (on error)                                     │
//  │  showCatalogError() ← friendly error message           │
//  └─────────────────────────────────────────────────────────┘
// =============================================================================


// -----------------------------------------------------------------------------
// 1. CONFIGURATION — ⚠️  Replace with your real project credentials
// -----------------------------------------------------------------------------
// تم استخراج هذه القيم مباشرة من إعدادات مشروعك في لقطة الشاشة
const SUPABASE_URL     = 'https://ldhgznnijofvggymqpid.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xWadB56cm3oYDCFkEP4YXA_BhOWlrDN';

// Number of skeleton cards to show while loading
const SKELETON_COUNT = 8;

// Max products to fetch per load (for pagination later)
const PAGE_SIZE = 12;


// -----------------------------------------------------------------------------
// 2. SUPABASE CLIENT INITIALIZATION
// -----------------------------------------------------------------------------
// ⚠️  FIX — SyntaxError: 'supabase' has already been declared
//
//  ROOT CAUSE:
//   The CDN <script> tag creates a GLOBAL object called `window.supabase`
//   (the full Supabase JS library namespace).
//   If we then write:  const supabase = window.supabase.createClient(...)
//   the JS engine sees TWO declarations named `supabase` in the same scope
//   → SyntaxError: Identifier 'supabase' has already been declared.
//
//  SOLUTION:
//   • Name the CLIENT variable `supabaseClient` (distinct from the namespace).
//   • Guard with a check so the script is safe to include on any page.
//   • Expose it on `window.supabaseClient` so other modules can import it.
//
// السبب: window.supabase هو كائن المكتبة الكامل من CDN.
// الحل:  نُسمي المتغير supabaseClient لتجنب تعارض الأسماء.

if (!window.supabase || typeof window.supabase.createClient !== 'function') {
  console.error(
    '[MotiveFlow] ❌ Supabase CDN script not loaded! ' +
    'Make sure the <script src="cdn.jsdelivr.net/...supabase-js"> tag ' +
    'appears BEFORE js/supabase.js in index.html.'
  );
  throw new Error('Supabase CDN missing — cannot initialize MotiveFlow catalog.');
}

// Create the authenticated client (safe name — no conflict with window.supabase)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expose globally so auth.js, vin.js, etc. can import the same client instance
window.supabaseClient = supabaseClient;

// ✅ Verification: confirm module is ready and client is active
console.log(
  '[MotiveFlow] ✅ Supabase Module Loaded Successfully — Client ready:',
  typeof supabaseClient.from === 'function' ? 'ACTIVE' : 'ERROR'
);


// -----------------------------------------------------------------------------
// 3. DOM REFERENCES — resolved after DOMContentLoaded
// -----------------------------------------------------------------------------
let catalogGrid      = null;   // .catalog-grid  — product card container
let catalogSection   = null;   // #catalog       — the whole section
let filterChips      = null;   // .chip[data-filter] — category filter pills
let activeCategory   = 'all';  // currently selected filter slug


// -----------------------------------------------------------------------------
// 4. SKELETON LOADER
// -----------------------------------------------------------------------------
/**
 * showSkeletons()
 * Renders N placeholder cards while real data is loading.
 * Uses the `.product-card.skeleton` CSS class defined in style.css.
 */
function showSkeletons() {
  if (!catalogGrid) return;

  catalogGrid.innerHTML = Array.from({ length: SKELETON_COUNT }, () => `
    <div class="product-card skeleton" aria-hidden="true">
      <div class="product-card__image skeleton-box"></div>
      <div class="product-card__body">
        <div class="skeleton-box skeleton-text short"></div>
        <div class="skeleton-box skeleton-text"></div>
        <div class="skeleton-box skeleton-text" style="width:60%"></div>
        <div class="skeleton-box skeleton-price"></div>
      </div>
    </div>
  `).join('');
}


// -----------------------------------------------------------------------------
// 5. FETCH PRODUCTS — async Supabase query with category join
// -----------------------------------------------------------------------------
/**
 * fetchProducts(categorySlug)
 * Queries the `products` table and joins `categories` to resolve the
 * category name in a single round-trip.
 *
 * KEY DESIGN DECISION — two query shapes are used:
 *
 *  a) categorySlug === 'all'
 *     Uses a LEFT JOIN  → categories ( name, slug )
 *     Returns ALL active products regardless of whether a category is set.
 *
 *  b) categorySlug !== 'all'
 *     Uses an INNER JOIN → categories!inner ( name, slug )
 *     PostgREST's !inner modifier means: only return products whose
 *     matching category row satisfies the subsequent .eq() filter.
 *     Without !inner, .eq('categories.slug', x) is applied AFTER the LEFT
 *     JOIN and Supabase still returns every product row (with categories=null
 *     on mismatches), forcing an expensive client-side filter pass.
 *     With !inner the filter happens server-side and zero extra rows travel
 *     over the network.
 *
 * @param {string} categorySlug  'all' or a slug from the categories table
 * @returns {Promise<Array>}     Array of product objects
 */
async function fetchProducts(categorySlug = 'all') {

  // ── Guard: ensure client is alive before querying ─────────────────────────
  // يتحقق من أن supabaseClient موجود ونشط قبل أي استعلام
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('supabaseClient is not initialized — cannot fetch products.');
  }

  // ── a) All products — LEFT JOIN ──────────────────────────────────────────
  if (categorySlug === 'all') {
    const { data, error } = await supabaseClient
      .from('products')
      .select(`
        id, name, slug, description, sku,
        price, compare_price, stock_quantity,
        image_url, is_featured, brand_name,
        categories ( name, slug )
      `)
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('created_at',  { ascending: false })
      .limit(PAGE_SIZE);

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data;
  }

  // ── b) Filtered by category — INNER JOIN (!inner) ────────────────────────
  // The !inner suffix tells PostgREST to use INNER JOIN semantics:
  // only rows that have a matching category with the given slug are returned.
  const { data, error } = await supabaseClient
    .from('products')
    .select(`
      id, name, slug, description, sku,
      price, compare_price, stock_quantity,
      image_url, is_featured, brand_name,
      categories!inner ( name, slug )
    `)
    .eq('is_active', true)
    .eq('categories.slug', categorySlug)   // server-side filter on joined table
    .order('is_featured', { ascending: false })
    .order('created_at',  { ascending: false })
    .limit(PAGE_SIZE);

  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data;
}


// -----------------------------------------------------------------------------
// 6. RENDER PRODUCTS — DOM injection
// -----------------------------------------------------------------------------
/**
 * renderProducts(products)
 * Clears existing cards (skeletons or old data) and injects
 * a new card for each product using existing CSS class names.
 *
 * Card anatomy:
 *  .product-card
 *    ├── .product-card__badge  (featured / low stock)
 *    ├── .product-card__image  (img or placeholder icon)
 *    └── .product-card__body
 *          ├── .product-card__category  (category pill)
 *          ├── .product-card__title
 *          ├── .product-card__brand
 *          ├── .product-card__description
 *          ├── .product-card__footer
 *          │     ├── .product-card__price (+ .old-price if discounted)
 *          │     └── .product-card__stock
 *          └── .product-card__actions
 *                └── (Add to Cart / Contact buttons)
 *
 * @param {Array} products - Array from fetchProducts()
 */
function renderProducts(products) {
  if (!catalogGrid) return;

  // ── No results state ──────────────────────────────────────────────────────
  if (!products || products.length === 0) {
    catalogGrid.innerHTML = `
      <div class="catalog-empty" role="status">
        <i class="fas fa-box-open"></i>
        <h3>Aucun produit trouvé</h3>
        <p>Aucun article disponible dans cette catégorie pour le moment.</p>
        <button class="btn btn-primary" onclick="loadProducts('all')">
          <i class="fas fa-redo"></i> Voir tout le catalogue
        </button>
      </div>
    `;
    return;
  }

  // ── Build HTML for each product ───────────────────────────────────────────
  const cardsHTML = products.map(product => {

    // Price display: if compare_price exists → show crossed-out original
    const priceBlock = product.compare_price
      ? `<span class="product-card__old-price">${formatPrice(product.compare_price)}</span>
         <span class="product-card__price discounted">${formatPrice(product.price)}</span>`
      : `<span class="product-card__price">${formatPrice(product.price)}</span>`;

    // Stock badge
    const stockBadge = product.stock_quantity <= 0
      ? `<span class="badge out-of-stock">Rupture</span>`
      : product.stock_quantity <= 5
        ? `<span class="badge low-stock">Dernières pièces</span>`
        : `<span class="badge in-stock">En Stock</span>`;

    // Featured ribbon
    const featuredRibbon = product.is_featured
      ? `<div class="product-card__ribbon">Vedette</div>`
      : '';

    // Category pill (from joined table)
    const categoryName = product.categories?.name ?? 'Pièce Auto';

    // Image with fallback to icon placeholder
    const imageBlock = product.image_url
      ? `<img
           src="${escapeHTML(product.image_url)}"
           alt="${escapeHTML(product.name)}"
           class="product-card__img"
           loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
         >
         <div class="product-card__img-placeholder" style="display:none">
           <i class="fas fa-cogs"></i>
         </div>`
      : `<div class="product-card__img-placeholder">
           <i class="fas fa-cogs"></i>
         </div>`;

    // Brand sub-title
    const brandLine = product.brand_name
      ? `<p class="product-card__brand"><i class="fas fa-tag"></i> ${escapeHTML(product.brand_name)}</p>`
      : '';

    // Truncated description (max 80 chars)
    const descText = product.description
      ? escapeHTML(product.description).substring(0, 80) + (product.description.length > 80 ? '…' : '')
      : '';

    // WhatsApp enquiry link pre-filled with product name
    const waMessage = encodeURIComponent(
      `Bonjour MotiveFlow, je suis intéressé(e) par: ${product.name} (Réf: ${product.sku ?? product.id})`
    );
    const waLink = `https://wa.me/21648331142?text=${waMessage}`;

    return `
      <article class="product-card reveal-up" data-product-id="${escapeHTML(product.id)}" role="listitem">
        ${featuredRibbon}
        <div class="product-card__image">
          ${imageBlock}
          <div class="product-card__badge-container">
            ${stockBadge}
          </div>
        </div>
        <div class="product-card__body">
          <span class="product-card__category">${escapeHTML(categoryName)}</span>
          <h3 class="product-card__title">${escapeHTML(product.name)}</h3>
          ${brandLine}
          ${descText ? `<p class="product-card__description">${descText}</p>` : ''}
          <div class="product-card__footer">
            <div class="product-card__prices">
              ${priceBlock}
            </div>
            <div class="product-card__stock-qty">
              ${product.stock_quantity > 0 ? `<i class="fas fa-warehouse"></i> ${product.stock_quantity} unités` : ''}
            </div>
          </div>
          <div class="product-card__actions">
            <a href="${waLink}" target="_blank" rel="noopener noreferrer"
               class="btn btn-primary btn-sm"
               aria-label="Commander ${escapeHTML(product.name)} via WhatsApp">
              <i class="fab fa-whatsapp"></i> Commander
            </a>
            <a href="#contact" class="btn btn-secondary btn-sm">
              <i class="fas fa-info-circle"></i> Infos
            </a>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Inject all cards at once (single reflow)
  catalogGrid.innerHTML = cardsHTML;

  // Re-run scroll reveal on newly injected elements
  reinitReveal();
}


// -----------------------------------------------------------------------------
// 7. ERROR STATE
// -----------------------------------------------------------------------------
/**
 * showCatalogError(message)
 * Replaces the catalog grid with a user-friendly error panel.
 *
 * @param {string} message - Technical error text (logged to console only)
 */
function showCatalogError(message) {
  console.error('[MotiveFlow Catalog]', message);

  if (!catalogGrid) return;

  catalogGrid.innerHTML = `
    <div class="catalog-error" role="alert">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Connexion temporairement indisponible</h3>
      <p>Le catalogue n'a pas pu être chargé. Veuillez réessayer dans quelques instants.</p>
      <button class="btn btn-primary" onclick="loadProducts('all')">
        <i class="fas fa-redo"></i> Réessayer
      </button>
    </div>
  `;
}


// -----------------------------------------------------------------------------
// 8. ORCHESTRATOR — wires everything together
// -----------------------------------------------------------------------------
/**
 * loadProducts(categorySlug)
 * Public entry point. Shows skeletons → fetches → renders or errors.
 * Exposed on window so HTML onclick handlers can call it directly.
 *
 * @param {string} categorySlug - Filter slug, default 'all'
 */
async function loadProducts(categorySlug = 'all') {
  activeCategory = categorySlug;

  // Step 1: Show skeleton placeholders immediately
  showSkeletons();

  try {
    // Step 2: Fetch from Supabase
    const products = await fetchProducts(categorySlug);

    // Step 3: Render real cards
    renderProducts(products);

  } catch (err) {
    // Step 4: Show graceful error UI
    showCatalogError(err.message);
  }
}

// Expose globally for the filter chip onclick handler in script.js
window.loadProducts = loadProducts;


// -----------------------------------------------------------------------------
// 9. CATEGORY FILTER INTEGRATION
// -----------------------------------------------------------------------------
/**
 * initCatalogFilter()
 * Hooks the existing .chip filter pills (already in the DOM) to
 * loadProducts() so clicking a chip fetches + renders filtered products.
 *
 * NOTE: The chips in the #skills section use data-filter slugs.
 * Make sure your categories.slug values in Supabase match them:
 *   'all', 'brakes', 'engine', 'suspension', 'electrical', 'filters'
 */
function initCatalogFilter() {
  const chips = document.querySelectorAll('#catalog-filter .chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      // Update active chip style
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const slug = chip.getAttribute('data-filter');
      loadProducts(slug);
    });
  });
}


// -----------------------------------------------------------------------------
// 10. UTILITIES
// -----------------------------------------------------------------------------

/**
 * formatPrice(value)
 * Formats a number as Tunisian Dinar with 3 decimal places.
 *
 * @param {number} value
 * @returns {string}  e.g. "49.900 TND"
 */
function formatPrice(value) {
  if (value == null) return 'Sur devis';
  return `${parseFloat(value).toFixed(3)} TND`;
}

/**
 * escapeHTML(str)
 * Prevents XSS when injecting user-controlled data into innerHTML.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

/**
 * getStorageUrl(bucket, path)
 * Constructs a fully-qualified public URL for a file in Supabase Storage.
 *
 * STRATEGY:
 *  MotiveFlow uses PUBLIC buckets for all product images and brand logos.
 *  Public bucket URLs follow this deterministic pattern:
 *    {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
 *
 *  Because the URL is deterministic, we don't need an API call — we
 *  construct it at render time from the path stored in `image_url`.
 *
 *  HOW TO POPULATE image_url IN THE DATABASE:
 *   Option A (recommended): Store only the file PATH (e.g. "products/p01.jpg")
 *     → call getStorageUrl('product-images', product.image_url) at render time.
 *   Option B (current seed): Store the full URL directly in image_url.
 *     → Use the value as-is (no call needed).
 *   Option C (programmatic upload): Use supabase.storage.from(bucket).upload()
 *     then store the returned `path` in the products row.
 *
 * @param {string} bucket  Supabase Storage bucket name, e.g. 'product-images'
 * @param {string} path    File path inside the bucket, e.g. 'kia-rio/brakes.jpg'
 * @returns {string}       Full public URL ready to use in <img src="...">
 *
 * @example
 *   // In renderProducts(), replace:
 *   //   src="${escapeHTML(product.image_url)}"
 *   // with:
 *   //   src="${getStorageUrl('product-images', product.image_url)}"
 */
function getStorageUrl(bucket, path) {
  if (!path) return null;
  // If path is already a full URL (Option B), return it unchanged
  if (path.startsWith('http')) return path;
  // Otherwise build from base URL (Option A)
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

// Expose so other modules (e.g. an admin panel) can construct URLs
window.getStorageUrl = getStorageUrl;

/**
 * reinitReveal()
 * After renderProducts() injects new DOM nodes, this function creates a
 * fresh IntersectionObserver to trigger .reveal-up animations on those nodes.
 *
 * IMPORTANT — WHY requestAnimationFrame:
 *  innerHTML assignment is synchronous, but the browser does NOT immediately
 *  perform layout (reflow) after it. If we call observe() in the same call
 *  stack as innerHTML, the elements have zero computed dimensions and the
 *  IntersectionObserver fires instantly for ALL of them (every element appears
 *  to be intersecting because the browser hasn't calculated their positions).
 *  By deferring one animation frame we guarantee layout has been committed,
 *  so the observer sees real bounding boxes and only animates cards that are
 *  actually in the viewport.
 */
function reinitReveal() {
  // Defer one animation frame so the browser commits the layout from innerHTML
  requestAnimationFrame(() => {
    const cards = document.querySelectorAll('.product-card.reveal-up:not(.revealed)');
    if (!cards.length) return;

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          obs.unobserve(entry.target); // stop watching once animated
        }
      });
    }, {
      threshold: 0.08,              // trigger when 8% of the card is visible
      rootMargin: '0px 0px -20px 0px' // slight negative bottom margin
    });

    cards.forEach(card => observer.observe(card));
  });
}


// -----------------------------------------------------------------------------
// 11. ENTRY POINT — Initialize on DOM ready
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {

  // ⚠️  IMPORTANT: Assign to the MODULE-LEVEL let variables (lines 51–54),
  //     NOT with const/let here.  Using const/let would create local variables
  //     that shadow the module-level ones, leaving showSkeletons(),
  //     renderProducts(), and showCatalogError() referencing null forever.
  catalogGrid    = document.getElementById('catalog-grid');
  catalogSection = document.getElementById('catalog');

  if (!catalogGrid) {
    // #catalog section not present on this page — skip silently.
    return;
  }

  // Wire category filter chips to loadProducts()
  initCatalogFilter();

  // Kick off the initial full-catalog load
  loadProducts('all');
});
