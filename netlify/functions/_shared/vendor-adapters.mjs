import vendorPayload from "../../../data/vendor-config.json" with { type: "json" };

const VENDOR_CONFIG = vendorPayload.vendors || {};
const DEFAULT_TIMEOUT_MS = 14000;
const DEFAULT_VARIATION_TIMEOUT_MS = 12000;
const DEFAULT_CONCURRENCY = 5;

function compact(value) {
  return value == null ? "" : String(value).trim();
}

function money(value) {
  if (value === undefined || value === null || value === "") return "Contact for price";
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? `$${parsed.toFixed(2)}` : "Contact for price";
}

function currentPrice(item = {}) {
  return money(item.sale_price || item.regular_price || item.price);
}

function categoryText(product = {}) {
  return (product.categories || []).map(category => compact(category.name)).filter(Boolean).join(" / ");
}

function appendQuery(url, params = {}) {
  const fallback = compact(url) || "#";
  try {
    const parsed = new URL(fallback);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") parsed.searchParams.set(key, String(value));
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

async function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS, headers = undefined) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, ...(headers ? { headers } : {}) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { response, data: await response.json() };
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await mapper(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(items.length, 1), limit) }, () => worker()));
  return results;
}

function wooAuth(config) {
  const ck = process.env[config.ckEnv];
  const cs = process.env[config.csEnv];
  if (!ck || !cs) throw new Error(`${config.vendor}: API credentials not configured`);
  return { ck, cs };
}

function wooParams(auth, extra = {}) {
  return new URLSearchParams({
    per_page: "100",
    consumer_key: auth.ck,
    consumer_secret: auth.cs,
    ...extra
  });
}

async function fetchAllWooProducts(config, auth) {
  const products = [];
  let page = 1;
  while (true) {
    const params = wooParams(auth, { page: String(page), status: "publish" });
    const { response, data } = await fetchJson(`${config.base}/products?${params}`, config.timeoutMs);
    if (!Array.isArray(data) || data.length === 0) break;
    products.push(...data);
    const pages = Number.parseInt(response.headers.get("X-WP-TotalPages") || "1", 10);
    if (page >= pages) break;
    page += 1;
  }
  return products;
}

async function fetchAllWooVariations(config, auth, productId) {
  const variations = [];
  let page = 1;
  while (true) {
    const params = wooParams(auth, { page: String(page), status: "publish" });
    const { response, data } = await fetchJson(`${config.base}/products/${productId}/variations?${params}`, config.variationTimeoutMs);
    if (!Array.isArray(data) || data.length === 0) break;
    variations.push(...data);
    const pages = Number.parseInt(response.headers.get("X-WP-TotalPages") || "1", 10);
    if (page >= pages) break;
    page += 1;
  }
  return variations;
}

function wooUrl(config, product = {}) {
  if (config.alwaysUseAffiliateUrl) return config.affiliateUrl;
  return appendQuery(product.permalink || config.affiliateUrl, config.affiliateParams || {});
}

function wooParentRow(config, product, warning = "") {
  const productName = compact(product.name) || `Unnamed product ${compact(product.id)}`.trim();
  const row = {
    company: config.vendor,
    product: productName,
    listing: productName,
    raw_product: productName,
    raw_listing: productName,
    raw_category: categoryText(product),
    price: currentPrice(product),
    sku: compact(product.sku),
    in_stock: product.stock_status === "instock",
    image: product.images?.[0]?.src || null,
    url: wooUrl(config, product),
    source: "api",
    source_type: product.type || "simple",
    source_product_id: compact(product.id)
  };
  if (warning) row.ingestion_warning = warning;
  return row;
}

function wooVariationRow(config, product, variation) {
  const parent = wooParentRow(config, product);
  const attributes = (variation.attributes || []).map(attribute => compact(attribute.option)).filter(Boolean).join(" / ");
  const listing = attributes ? `${parent.raw_product} - ${attributes}` : parent.raw_product;
  return {
    ...parent,
    listing,
    raw_listing: listing,
    price: currentPrice(variation),
    sku: compact(variation.sku) || parent.sku,
    in_stock: variation.stock_status === "instock",
    image: variation.image?.src || parent.image,
    source_type: "variation",
    source_variation_id: compact(variation.id)
  };
}

function wooAdapter(options) {
  const config = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    variationTimeoutMs: DEFAULT_VARIATION_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
    ...options
  };
  return {
    vendor: config.vendor,
    async load() {
      const auth = wooAuth(config);
      const rawProducts = await fetchAllWooProducts(config, auth);
      const warnings = [];
      let variationRows = 0;
      let variationFetchErrors = 0;
      const nested = await mapWithConcurrency(rawProducts, config.concurrency, async product => {
        if (product.type !== "variable") return [wooParentRow(config, product)];
        try {
          const variations = await fetchAllWooVariations(config, auth, product.id);
          if (!variations.length) {
            const warning = "variable_product_returned_no_variations_parent_retained";
            warnings.push({ source_product_id: compact(product.id), product: compact(product.name), warning });
            return [wooParentRow(config, product, warning)];
          }
          variationRows += variations.length;
          return variations.map(variation => wooVariationRow(config, product, variation));
        } catch (error) {
          variationFetchErrors += 1;
          const warning = `variation_fetch_failed_parent_retained: ${error.message}`;
          warnings.push({ source_product_id: compact(product.id), product: compact(product.name), warning });
          return [wooParentRow(config, product, warning)];
        }
      });
      const products = nested.flat();
      return {
        vendor: config.vendor,
        fetched_at: new Date().toISOString(),
        products,
        metadata: {
          source_type: "woocommerce",
          source_product_count: rawProducts.length,
          returned_rows: products.length,
          variable_products: rawProducts.filter(product => product.type === "variable").length,
          variation_rows: variationRows,
          variation_fetch_errors: variationFetchErrors,
          warnings
        }
      };
    }
  };
}

// Peptidology. Custom WordPress plugin feed, token in an X-Catalog-Token header
// so it stays out of URLs and server logs.
//
// Every product is type "variable" with a variations array, and the size lives
// in the variation label. The vendor said labels begin with the size in mg, but
// a good share of them do not: sizes appear mid-string ("GHK-Cu 2.56mg"), in
// mcg or ug, as blends ("10mg, 10mg, 50mg (70mg total)"), or not at all
// ("Batch SLU0012026-01 - 60 capsules"). The label is cleaned rather than
// trusted, and anything with no recoverable size falls through to the engine's
// normal no-size handling instead of being dropped.
function peptidologyCleanLabel(label) {
  return compact(String(label || ""))
    // Batch and purity noise. Their data uses both "|" and a capital "I" as the
    // separator, so both are matched.
    .replace(/\s*[|I]\s*Batch\s+[^|I]*/gi, " ")
    .replace(/\s*[|I]\s*[\d.]+%\s*Purity\s*/gi, " ")
    .replace(/\s*-\s*[A-Z]{2,}\d{4,}[-\d]*\s*/g, " ")
    .replace(/\bBatch\s+[A-Z0-9-]+/gi, " ")
    // "ug" is micrograms; the engine understands mcg, not ug.
    .replace(/(\d)\s*ug\b/gi, "$1mcg")
    // "552.18 mg" -> "552.18mg" so the dose regex sees one token.
    .replace(/(\d)\s+(mcg|mg|g|ml)\b/gi, "$1$2")
    .replace(/\s{2,}/g, " ")
    // Stripping a batch code can leave a dangling separator, as in
    // "Batch SLU0012026-01 - 60 capsules" -> "- 60 capsules".
    .replace(/^[\s|,\-]+|[\s|,\-]+$/g, "")
    .trim();
}

function peptidologyAdapter() {
  const vendor = "Peptidology";
  return {
    vendor,
    async load() {
      const token = process.env.PEPTIDOLOGY_TOKEN;
      if (!token) throw new Error("PEPTIDOLOGY_TOKEN not set");
      const { data } = await fetchJson(
        "https://peptidology.co/wp-json/pep-catalog/v1/products",
        15000,
        // fetchJson takes the headers object directly, not wrapped in options.
        { "X-Catalog-Token": token }
      );
      const products = [];
      let skippedNoPrice = 0;
      for (const product of data.products || []) {
        const name = compact(product.name);
        if (!name) continue;
        const variations = Array.isArray(product.variations) ? product.variations : [];
        // A product with no variations has nothing priceable behind it.
        for (const variation of variations) {
          // Guard on the raw value: money() returns a formatted string or the
          // sentinel "Contact for price", never null, so a null check here would
          // never fire. Variations with an empty price are placeholders for
          // sold-out sizes, and listing them would put a priceless row into a
          // comparison whose whole job is ranking on price.
          const rawPrice = compact(variation.price);
          if (!rawPrice || !Number.isFinite(Number.parseFloat(rawPrice))) { skippedNoPrice += 1; continue; }
          const price = money(rawPrice);
          const size = peptidologyCleanLabel(variation.label);
          const listing = size ? `${name} - ${size}` : name;
          products.push({
            company: vendor,
            product: name,
            listing,
            raw_product: name,
            raw_listing: listing,
            sku: compact(variation.sku),
            price,
            regular_price: compact(variation.regular_price) ? money(variation.regular_price) : price,
            in_stock: String(variation.stock_status || "").toLowerCase() !== "outofstock",
            url: compact(product.url),
            source_product_id: String(product.id || ""),
            source_variation_id: String(variation.id || "")
          });
        }
      }
      return {
        vendor,
        products,
        fetched_at: new Date().toISOString(),
        metadata: {
          source_type: "custom-json",
          source_product_count: (data.products || []).length,
          returned_rows: products.length,
          skipped_unpriced_variations: skippedNoPrice
        }
      };
    }
  };
}

function instantAdapter() {
  const vendor = "Instant Peptides";
  return {
    vendor,
    async load() {
      const { data } = await fetchJson("https://instantpeptides.com/api/feeds/peptide-price", 15000);
      const products = [];
      for (const product of data.products || []) {
        for (const variant of product.variants || []) {
          const quantity = Number(variant.pack_qty || 1);
          const unitWord = compact(variant.form).toLowerCase() === "capsule" ? "capsules" : "vials";
          const pack = quantity > 1 ? ` (${quantity} ${unitWord})` : "";
          products.push({
            company: vendor,
            product: compact(product.name),
            listing: `${compact(product.name)} - ${compact(variant.size)}${compact(variant.unit)}${pack}`,
            raw_product: compact(product.name),
            raw_listing: `${compact(product.name)} - ${compact(variant.size)}${compact(variant.unit)}${pack}`,
            price: money(variant.price),
            sku: `${compact(variant.size)}${compact(variant.unit)}-${compact(variant.form)}-x${quantity}`,
            in_stock: variant.in_stock === true,
            url: appendQuery(product.url || VENDOR_CONFIG[vendor]?.affiliate_url, { ref: "SAMMYC" }),
            source: "api",
            source_type: "custom-json"
          });
        }
      }
      return { vendor, fetched_at: new Date().toISOString(), products, metadata: { source_type: "custom-json", returned_rows: products.length } };
    }
  };
}

function labSourcedAdapter() {
  const vendor = "LabSourced Peptides";
  return {
    vendor,
    async load() {
      const { data } = await fetchJson("https://labsourced.com/api/public/products", 15000);
      const products = (data.products || []).map(product => ({
        company: vendor,
        product: compact(product.name),
        listing: compact(product.full_name || product.name),
        raw_product: compact(product.name),
        raw_listing: compact(product.full_name || product.name),
        price: money(product.price),
        sku: compact(product.sku || product.id),
        in_stock: product.in_stock === true,
        url: appendQuery(product.url || VENDOR_CONFIG[vendor]?.affiliate_url, { ref: "SammyC" }),
        image: product.image || null,
        source: "api",
        source_type: "custom-json"
      }));
      return { vendor, fetched_at: data.generated_at || new Date().toISOString(), products, metadata: { source_type: "custom-json", returned_rows: products.length } };
    }
  };
}

function configUrl(vendor) {
  return VENDOR_CONFIG[vendor]?.affiliate_url || "#";
}

// Orbitrex Peptides runs a custom JSON feed (not WooCommerce), authenticated
// with a Bearer key. Feed spec: url is the unique key (sku can be null); price
// is the effective charged price (sale price when on sale); variant is omitted
// when the product has no variants; category is omitted when uncategorised;
// in_stock follows checkout availability. Stays silent (throws, caught upstream
// by Promise.allSettled) until ORBITREX_API_KEY is set in Netlify.
function orbitrexAdapter() {
  const vendor = "Orbitrex Peptides";
  return {
    vendor,
    async load() {
      const key = process.env.ORBITREX_API_KEY;
      if (!key) throw new Error("ORBITREX_API_KEY not set");
      const { data } = await fetchJson(
        "https://orbitrexpeptide.is/api/feed/prices",
        15000,
        { Authorization: `Bearer ${key}`, Accept: "application/json" }
      );
      const rows = Array.isArray(data) ? data : (data.products || data.items || data.prices || []);
      const products = [];
      for (const item of rows) {
        let name = compact(item.name || item.product || item.title);
        if (!name || !item.url) continue; // url is always present and unique
        // Orbitrex prefixes some codes with a product-line marker like "1G-"
        // (e.g. "1G-SGT 10mg"). It is not a quantity, and leaving it in made
        // the size read as "1g / 10mg" instead of "10mg". Strip a leading
        // digit+G hyphen prefix only; a real gram size is written as a
        // trailing quantity, so this cannot swallow a genuine weight.
        name = name.replace(/^\d+\s*G\s*-\s*/i, "").trim();
        const variant = compact(item.variant);
        const listing = variant ? `${name} - ${variant}` : name;
        // price/price_cents is the effective (charged) price; feeds already
        // include any sale, matching how the rest of the catalog is priced.
        const priceValue = item.price != null
          ? item.price
          : (item.price_cents != null ? Number(item.price_cents) / 100 : null);
        products.push({
          company: vendor,
          product: name,
          listing,
          raw_product: name,
          raw_listing: listing,
          price: money(priceValue),
          category: compact(item.category),
          sku: compact(item.sku) || null,
          in_stock: item.in_stock === true,
          url: appendQuery(item.url || VENDOR_CONFIG[vendor]?.affiliate_url, { ref: "SammyC", utm_source: "affiliate", utm_medium: "referral", utm_campaign: "SammyC" }),
          source: "api",
          source_type: "custom-json"
        });
      }
      return { vendor, fetched_at: new Date().toISOString(), products, metadata: { source_type: "custom-json", returned_rows: products.length } };
    }
  };
}

function zenithAdapter() {
  const vendor = "Zenith Bioscience";
  return {
    vendor,
    async load() {
      const key = process.env.ZENITH_API_KEY;
      if (!key) throw new Error("ZENITH_API_KEY not set");
      const { data } = await fetchJson(
        process.env.ZENITH_FEED_URL || "https://api.zenithbioscience.com/api/public/catalog",
        // Zenith returns the entire catalog in one unpaginated response and has
        // measured slower than 15s on a cold endpoint, which aborted the pull.
        // Raised deliberately rather than trimming the request, since their
        // contract offers no pagination or filtering to shrink the payload.
        Number(process.env.ZENITH_TIMEOUT_MS) || 30000,
        { Authorization: `Bearer ${key}`, Accept: "application/json" }
      );
      const rows = Array.isArray(data?.products) ? data.products : [];
      const products = [];
      for (const item of rows) {
        const name = compact(item.name);
        if (!name || !item.productUrl) continue;
        const size = compact(item.size);
        const listing = size ? `${name} - ${size}` : name;
        // The feed sends the regular price in `price` and only includes
        // `salePrice` when a sale is actually running, so the effective
        // charged price is salePrice when present. Every other vendor feed is
        // already sale-inclusive, so taking `price` here would overstate
        // Zenith against the rest of the catalog.
        const effective = item.salePrice != null ? item.salePrice : item.price;
        products.push({
          company: vendor,
          product: name,
          listing,
          raw_product: name,
          raw_listing: listing,
          price: money(effective),
          category: compact(item.category),
          sku: compact(item.sku) || null,
          in_stock: item.inStock === true,
          // appendQuery uses the URL API, which places the query string before
          // the hash. Zenith variant links carry a #size= fragment and need
          // ?ref= ahead of it, so this ordering is required, not incidental.
          url: appendQuery(item.productUrl || VENDOR_CONFIG[vendor]?.affiliate_url, { ref: "SAMMYC" }),
          source: "api",
          source_type: "custom-json"
        });
      }
      return { vendor, fetched_at: new Date().toISOString(), products, metadata: { source_type: "custom-json", returned_rows: products.length } };
    }
  };
}

// WooCommerce-only vendor list (excludes Instant Peptides and LabSourced Peptides,
// which run custom JSON APIs and have no payment_gateways endpoint).
// Reused by scripts/refresh-payment-methods.mjs.
export const WOO_VENDOR_API_CONFIG = [
  { vendor: "Glacier Aminos", base: "https://glacieraminos.shop/wp-json/wc/v3", ckEnv: "GLACIER_CK", csEnv: "GLACIER_CS" },
  { vendor: "Ion Peptide", base: "https://ionpeptide.com/wp-json/wc/v3", ckEnv: "ION_CK", csEnv: "ION_CS" },
  { vendor: "Southern Aminos", base: "https://southernaminos.com/wp-json/wc/v3", ckEnv: "SOUTHERN_CK", csEnv: "SOUTHERN_CS" },
  { vendor: "Flawless Compounds", base: "https://flawlesscompounds.com/wp-json/wc/v3", ckEnv: "FLAWLESS_CK", csEnv: "FLAWLESS_CS" },
  { vendor: "Glow Aminos", base: "https://glowaminos.com/wp-json/wc/v3", ckEnv: "GLOW_CK", csEnv: "GLOW_CS" },
  { vendor: "Mile High Peptides", base: "https://milehighcompounds.is/wp-json/wc/v3", ckEnv: "MILEHIGH_CK", csEnv: "MILEHIGH_CS" },
  { vendor: "Solyn Labs", base: "https://solyn.com/wp-json/wc/v3", ckEnv: "SOLYN_CK", csEnv: "SOLYN_CS" },
  { vendor: "Oneday Compounds", base: `${(process.env.ONEDAY_BASE_URL || "https://onedaycompounds.net").replace(/\/+$/, "")}/wp-json/wc/v3`, ckEnv: "ONEDAY_CK", csEnv: "ONEDAY_CS" },
  { vendor: "Coffee and Peppers", base: "https://coffeeandpeppers.com/wp-json/wc/v3", ckEnv: "COFFEEANDPEPPERS_CK", csEnv: "COFFEEANDPEPPERS_CS" },
  { vendor: "Bioedge Research Labs", base: "https://bioedgeresearchlabs.com/wp-json/wc/v3", ckEnv: "BIOEDGE_CK", csEnv: "BIOEDGE_CS" },
  { vendor: "High Tide Compounds", base: "https://hightidecompounds.com/wp-json/wc/v3", ckEnv: "HIGHTIDE_CK", csEnv: "HIGHTIDE_CS" },
  { vendor: "Disguised Alpha", base: "https://disguisedalpha.com/wp-json/wc/v3", ckEnv: "DISGUISEDALPHA_CK", csEnv: "DISGUISEDALPHA_CS" },
  { vendor: "Iron Protocol", base: `${(process.env.IRON_PROTOCOL_BASE_URL || "https://ironprotocol.com").replace(/\/+$/, "")}/wp-json/wc/v3`, ckEnv: "IRON_PROTOCOL_CK", csEnv: "IRON_PROTOCOL_CS" },
  { vendor: "Peptira", base: `${(process.env.PEPTIRA_BASE_URL || "https://peptira.com").replace(/\/+$/, "")}/wp-json/wc/v3`, ckEnv: "PEPTIRA_CK", csEnv: "PEPTIRA_CS" }
];

export { wooAuth, wooParams, fetchJson };

export const VENDOR_ADAPTERS = [
  wooAdapter({ vendor: "Glacier Aminos", base: "https://glacieraminos.shop/wp-json/wc/v3", ckEnv: "GLACIER_CK", csEnv: "GLACIER_CS", affiliateUrl: configUrl("Glacier Aminos"), affiliateParams: { ref: "SammyC", coupon: "SammyC" } }),
  wooAdapter({ vendor: "Ion Peptide", base: "https://ionpeptide.com/wp-json/wc/v3", ckEnv: "ION_CK", csEnv: "ION_CS", affiliateUrl: configUrl("Ion Peptide"), affiliateParams: { ref: "SammyC" }, timeoutMs: 25000 }),
  wooAdapter({ vendor: "Southern Aminos", base: "https://southernaminos.com/wp-json/wc/v3", ckEnv: "SOUTHERN_CK", csEnv: "SOUTHERN_CS", affiliateUrl: configUrl("Southern Aminos"), affiliateParams: { coupon: "sammyc" } }),
  wooAdapter({ vendor: "Flawless Compounds", base: "https://flawlesscompounds.com/wp-json/wc/v3", ckEnv: "FLAWLESS_CK", csEnv: "FLAWLESS_CS", affiliateUrl: configUrl("Flawless Compounds"), affiliateParams: { coupon: "SammyC" } }),
  wooAdapter({ vendor: "Glow Aminos", base: "https://glowaminos.com/wp-json/wc/v3", ckEnv: "GLOW_CK", csEnv: "GLOW_CS", affiliateUrl: configUrl("Glow Aminos"), affiliateParams: { ref: "sammyc", coupon: "SammyC" } }),
  wooAdapter({ vendor: "Mile High Peptides", base: "https://milehighcompounds.is/wp-json/wc/v3", ckEnv: "MILEHIGH_CK", csEnv: "MILEHIGH_CS", affiliateUrl: configUrl("Mile High Peptides"), affiliateParams: { ref: "sammyc" } }),
  // Aurora Peptides. Credentials live in Netlify environment variables only:
  // the repository is public, so ck_/cs_ pairs must never be committed.
  // Affiliate attribution is a numeric partner id rather than a code.
  wooAdapter({ vendor: "Aurora Peptides", base: "https://aurora-peptides.com/wp-json/wc/v3", ckEnv: "AURORA_CK", csEnv: "AURORA_CS", affiliateUrl: configUrl("Aurora Peptides"), affiliateParams: { ref: "102" } }),
  peptidologyAdapter(),
  instantAdapter(),
  labSourcedAdapter(),
  wooAdapter({ vendor: "Solyn Labs", base: "https://solyn.com/wp-json/wc/v3", ckEnv: "SOLYN_CK", csEnv: "SOLYN_CS", affiliateUrl: configUrl("Solyn Labs"), alwaysUseAffiliateUrl: true }),
  wooAdapter({ vendor: "Oneday Compounds", base: `${(process.env.ONEDAY_BASE_URL || "https://onedaycompounds.net").replace(/\/+$/, "")}/wp-json/wc/v3`, ckEnv: "ONEDAY_CK", csEnv: "ONEDAY_CS", affiliateUrl: process.env.ONEDAY_AFFILIATE_URL || configUrl("Oneday Compounds"), alwaysUseAffiliateUrl: true }),
  wooAdapter({ vendor: "Coffee and Peppers", base: "https://coffeeandpeppers.com/wp-json/wc/v3", ckEnv: "COFFEEANDPEPPERS_CK", csEnv: "COFFEEANDPEPPERS_CS", affiliateUrl: configUrl("Coffee and Peppers"), affiliateParams: { coupon: "sammyc" } }),
  wooAdapter({ vendor: "Bioedge Research Labs", base: "https://bioedgeresearchlabs.com/wp-json/wc/v3", ckEnv: "BIOEDGE_CK", csEnv: "BIOEDGE_CS", affiliateUrl: configUrl("Bioedge Research Labs"), affiliateParams: { aff: "1005717" } }),
  wooAdapter({ vendor: "High Tide Compounds", base: "https://hightidecompounds.com/wp-json/wc/v3", ckEnv: "HIGHTIDE_CK", csEnv: "HIGHTIDE_CS", affiliateUrl: configUrl("High Tide Compounds"), affiliateParams: { aff: "44" } }),
  wooAdapter({ vendor: "Disguised Alpha", base: "https://disguisedalpha.com/wp-json/wc/v3", ckEnv: "DISGUISEDALPHA_CK", csEnv: "DISGUISEDALPHA_CS", affiliateUrl: configUrl("Disguised Alpha"), affiliateParams: { coupon: "sammyc" } }),
  // Iron Protocol attributes through a path-based referral link
  // (/ref/<partner-id>/) rather than a query parameter, so product deep links
  // cannot carry attribution. Every outbound click uses the referral URL.
  wooAdapter({ vendor: "Iron Protocol", base: `${(process.env.IRON_PROTOCOL_BASE_URL || "https://ironprotocol.com").replace(/\/+$/, "")}/wp-json/wc/v3`, ckEnv: "IRON_PROTOCOL_CK", csEnv: "IRON_PROTOCOL_CS", affiliateUrl: process.env.IRON_PROTOCOL_AFFILIATE_URL || configUrl("Iron Protocol"), alwaysUseAffiliateUrl: true }),
  // Peptira attributes with a ?ref= query parameter, so product deep links keep
  // attribution and buyers land on the exact product rather than the homepage.
  wooAdapter({ vendor: "Peptira", base: `${(process.env.PEPTIRA_BASE_URL || "https://peptira.com").replace(/\/+$/, "")}/wp-json/wc/v3`, ckEnv: "PEPTIRA_CK", csEnv: "PEPTIRA_CS", affiliateUrl: process.env.PEPTIRA_AFFILIATE_URL || configUrl("Peptira"), affiliateParams: { ref: "SAMMYC" } }),
  // Orbitrex Peptides runs a custom JSON feed with Bearer auth, not
  // WooCommerce. Stays silent until ORBITREX_API_KEY is set in Netlify.
  orbitrexAdapter(),
  // Zenith Bioscience also runs a custom JSON feed with Bearer auth. Stays
  // silent until ZENITH_API_KEY is set in Netlify.
  zenithAdapter()
];
