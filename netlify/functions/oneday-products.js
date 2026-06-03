// Netlify Serverless Function — Oneday Compounds Product Feed
// Deployed at: https://mypeptideprice.com/.netlify/functions/oneday-products

const CK   = process.env.ONEDAY_CK;
const CS   = process.env.ONEDAY_CS;
const SITE = (process.env.ONEDAY_BASE_URL || "https://onedaycompounds.net").replace(/\/+$/, "");
const BASE = `${SITE}/wp-json/wc/v3`;
const COMPANY       = "Oneday Compounds";
const AFFILIATE_URL = process.env.ONEDAY_AFFILIATE_URL || `${SITE}/?ref=subileue`;
const PER_PAGE      = 100;
const FETCH_TIMEOUT = 15000;
const VARIATION_CONCURRENCY = 5;

const EXCLUDE_TERMS = [
  "ship safely","shipping protection","shipping insurance",
  "package protection","route protection","gift card","giftcard","gift certificate"
];

function fetchWithTimeout(url, ms = FETCH_TIMEOUT) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function fetchJSON(url, ms = FETCH_TIMEOUT) {
  const resp = await fetchWithTimeout(url, ms);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`);
  return { resp, data: await resp.json() };
}

async function fetchAllProducts() {
  const params = (page) => new URLSearchParams({
    per_page: String(PER_PAGE), page: String(page),
    status: "publish", consumer_key: CK, consumer_secret: CS
  }).toString();

  const { resp: resp1, data: page1 } = await fetchJSON(`${BASE}/products?${params(1)}`);
  if (!Array.isArray(page1) || page1.length === 0) return [];

  const totalPages = parseInt(resp1.headers.get("X-WP-TotalPages") || "1", 10);
  if (totalPages <= 1) return page1;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      fetchJSON(`${BASE}/products?${params(i + 2)}`).then(r => r.data).catch(() => [])
    )
  );
  return page1.concat(...rest);
}

async function fetchVariations(productId) {
  const params = new URLSearchParams({
    per_page: String(PER_PAGE), consumer_key: CK, consumer_secret: CS
  }).toString();
  try {
    const { data } = await fetchJSON(`${BASE}/products/${productId}/variations?${params}`);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.log(`Oneday variation fetch skipped for ${productId}: ${err.message}`);
    return [];
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try { results[i] = await mapper(items[i]); }
      catch (err) { console.warn(`Skipped product: ${err.message}`); results[i] = []; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function shouldExclude(product) {
  const t = [
    ...(product.categories || []).map(c => c.name || ""),
    product.name || "", product.sku || "", product.slug || ""
  ].join(" ").toLowerCase();
  return EXCLUDE_TERMS.some(term => t.includes(term));
}

function mapCategory(product) {
  const t = [
    ...(product.categories || []).map(c => c.name || ""),
    product.name || "", product.sku || ""
  ].join(" ").toLowerCase();
  if (/glp|semaglutide|tirzepatide|retatrutide|cagrilintide|cagri|mazdutide|orforglipron|survodutide|liraglutide|amycretin|weight|oc-3rt|ion-[123][str]|gla-[123]|pep-(?:sm|tz|trz|rt)|tesofensine|metaboflex/.test(t)) return "GLP-1 & Incretin";
  if (/bpc|tb-500|tb500|repair|recover|healing|kpv|ll-37|ll37|thymosin/.test(t)) return "Repair & Recovery";
  if (/nad|epitalon|epithalon|snap-8|humanin|foxo4|ss-31|mtp|longevity|anti-aging/.test(t)) return "Longevity & Cellular Health";
  if (/semax|selank|dihexa|nootropic|cognitive|cerebrolysin|vip/.test(t)) return "Cognitive & Nootropic";
  if (/ipamorelin|cjc|ghrp|ghrh|sermorelin|tesamorelin|hexarelin|igf|growth hormone/.test(t)) return "Growth Hormone Research";
  if (/melanotan|mt-[12]|pt-141|bremelanotide|kisspeptin|sexual|tanning/.test(t)) return "Skin, Tanning & Sexual Health";
  if (/aod|mots|lipo|metabolic|mitochondrial|energy|5-amino|slu-pp/.test(t)) return "Metabolic & Mitochondrial";
  if (/capsule|tablet|oral/.test(t)) return "Capsules";
  if (/water|bac|bacteriostatic|sterile|syringe|needle|pen|kit|vial cover|supplies/.test(t)) return "Supplies";
  return "Other";
}

function formatPrice(regular, sale, fallback) {
  const p = (sale && sale !== "") ? sale : (regular && regular !== "") ? regular : fallback;
  if (!p) return "Contact for price";
  const n = parseFloat(p);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "Contact for price";
}

function productUrl(permalink) {
  try {
    const u = new URL(permalink || AFFILIATE_URL);
    u.searchParams.set("ref", "subileue");
    return u.toString();
  } catch { return AFFILIATE_URL; }
}

async function transformProduct(product) {
  const category = mapCategory(product);
  const image    = product.images?.[0]?.src || null;
  const baseUrl  = productUrl(product.permalink);
  const results  = [];

  if (product.type === "variable") {
    const variations = await fetchVariations(product.id);
    if (variations.length === 0) {
      results.push({ product: product.name, listing: product.name, company: COMPANY, category,
        price: formatPrice(product.regular_price, product.sale_price, product.price),
        sku: product.sku, in_stock: product.stock_status === "instock",
        image, url: baseUrl, source: "api" });
    } else {
      for (const v of variations) {
        const attrs = (v.attributes || []).map(a => a.option).filter(Boolean).join(" / ");
        const listing = attrs ? `${product.name} - ${attrs}` : product.name;
        results.push({ product: product.name, listing, company: COMPANY, category,
          price: formatPrice(v.regular_price, v.sale_price, v.price),
          sku: v.sku || product.sku, in_stock: v.stock_status === "instock",
          image: v.image?.src || image, url: baseUrl, source: "api" });
      }
    }
  } else {
    results.push({ product: product.name, listing: product.name, company: COMPANY, category,
      price: formatPrice(product.regular_price, product.sale_price, product.price),
      sku: product.sku, in_stock: product.stock_status === "instock",
      image, url: baseUrl, source: "api" });
  }
  return results;
}

const HEADERS = {
  "Access-Control-Allow-Origin":  "https://mypeptideprice.com",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type":                 "application/json",
  "Cache-Control":                "public, max-age=300, stale-while-revalidate=21600",
  "Netlify-CDN-Cache-Control":    "public, durable, max-age=900, stale-while-revalidate=21600"
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: HEADERS, body: "" };
  try {
    if (!CK || !CS) throw new Error("API credentials not configured");
    const raw         = await fetchAllProducts();
    const eligible    = raw.filter(p => !shouldExclude(p));
    const transformed = (await mapWithConcurrency(eligible, VARIATION_CONCURRENCY, transformProduct)).flat();
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({
      vendor: COMPANY, fetched_at: new Date().toISOString(),
      count: transformed.length, products: transformed
    })};
  } catch (err) {
    console.error(`${COMPANY} feed error:`, err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
