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

async function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
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

export const VENDOR_ADAPTERS = [
  wooAdapter({ vendor: "Glacier Aminos", base: "https://glacieraminos.shop/wp-json/wc/v3", ckEnv: "GLACIER_CK", csEnv: "GLACIER_CS", affiliateUrl: configUrl("Glacier Aminos"), affiliateParams: { ref: "SammyC", coupon: "SammyC" } }),
  wooAdapter({ vendor: "Ion Peptide", base: "https://ionpeptide.com/wp-json/wc/v3", ckEnv: "ION_CK", csEnv: "ION_CS", affiliateUrl: configUrl("Ion Peptide"), affiliateParams: { ref: "SammyC" }, timeoutMs: 25000 }),
  wooAdapter({ vendor: "Southern Aminos", base: "https://southernaminos.com/wp-json/wc/v3", ckEnv: "SOUTHERN_CK", csEnv: "SOUTHERN_CS", affiliateUrl: configUrl("Southern Aminos"), affiliateParams: { coupon: "sammyc" } }),
  wooAdapter({ vendor: "Flawless Compounds", base: "https://flawlesscompounds.com/wp-json/wc/v3", ckEnv: "FLAWLESS_CK", csEnv: "FLAWLESS_CS", affiliateUrl: configUrl("Flawless Compounds"), affiliateParams: { coupon: "SammyC" } }),
  wooAdapter({ vendor: "Glow Aminos", base: "https://glowaminos.com/wp-json/wc/v3", ckEnv: "GLOW_CK", csEnv: "GLOW_CS", affiliateUrl: configUrl("Glow Aminos"), affiliateParams: { ref: "sammyc", coupon: "SammyC" } }),
  wooAdapter({ vendor: "Mile High Peptides", base: "https://milehighcompounds.is/wp-json/wc/v3", ckEnv: "MILEHIGH_CK", csEnv: "MILEHIGH_CS", affiliateUrl: configUrl("Mile High Peptides"), affiliateParams: { ref: "sammyc" } }),
  instantAdapter(),
  labSourcedAdapter(),
  wooAdapter({ vendor: "Solyn Labs", base: "https://solyn.com/wp-json/wc/v3", ckEnv: "SOLYN_CK", csEnv: "SOLYN_CS", affiliateUrl: configUrl("Solyn Labs"), alwaysUseAffiliateUrl: true }),
  wooAdapter({ vendor: "Oneday Compounds", base: `${(process.env.ONEDAY_BASE_URL || "https://onedaycompounds.net").replace(/\/+$/, "")}/wp-json/wc/v3`, ckEnv: "ONEDAY_CK", csEnv: "ONEDAY_CS", affiliateUrl: process.env.ONEDAY_AFFILIATE_URL || configUrl("Oneday Compounds"), alwaysUseAffiliateUrl: true }),
  wooAdapter({ vendor: "Coffee and Peppers", base: "https://coffeeandpeppers.com/wp-json/wc/v3", ckEnv: "COFFEEANDPEPPERS_CK", csEnv: "COFFEEANDPEPPERS_CS", affiliateUrl: configUrl("Coffee and Peppers"), affiliateParams: { coupon: "sammyc" } }),
  wooAdapter({ vendor: "Bioedge Research Labs", base: "https://bioedgeresearchlabs.com/wp-json/wc/v3", ckEnv: "BIOEDGE_CK", csEnv: "BIOEDGE_CS", affiliateUrl: configUrl("Bioedge Research Labs"), affiliateParams: { aff: "1005717" } })
];
