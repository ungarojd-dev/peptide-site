// Netlify Serverless Function — Southern Aminos Product Feed
// Deployed at: https://mypeptideprice.com/.netlify/functions/southern-products

const CK   = process.env.SOUTHERN_CK;
const CS   = process.env.SOUTHERN_CS;
const BASE = "https://southernaminos.com/wp-json/wc/v3";
const COMPANY       = "Southern Aminos";
const AFFILIATE_URL = "https://southernaminos.com/?ref=SAMMYC";
const PER_PAGE      = 100;
const FETCH_TIMEOUT = 15000;
const VARIATION_CONCURRENCY = 5;

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
  } catch { return []; }
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

function mapCategory(wcCategories) {
  const t = (wcCategories || []).map(c => c.name || "").join(" ").toLowerCase();
  if (/glp|semaglutide|tirzepatide|retatrutide|cagrilintide|cagri|mazdutide|orforglipron|survodutide|liraglutide|amycretin|weight|gla-[123]|ion-[123][str]|pep-(?:sm|tz|trz|rt)|tesofensine|metaboflex/.test(t)) return "GLP-1 & Incretin";
  if (/recover|heal|bpc|tb-500|repair/.test(t)) return "Repair & Recovery";
  if (/longev|anti-ag|nad|epitalon/.test(t)) return "Longevity & Cellular Health";
  if (/cogni|nootropic|semax|selank/.test(t)) return "Cognitive & Nootropic";
  if (/growth|ghrp|ghrh|ipamorelin|cjc/.test(t)) return "Growth Hormone Research";
  if (/sexual|tann|melanotan|pt-141|bremelanotide/.test(t)) return "Skin, Tanning & Sexual Health";
  if (/metabol|energy|aod|mots/.test(t)) return "Metabolic & Mitochondrial";
  if (/capsule|oral/.test(t)) return "Capsules";
  if (/suppl|kit|water|bac/.test(t)) return "Supplies";
  return "Other";
}

function formatPrice(regular, sale) {
  const p = (sale && sale !== "") ? sale : regular;
  if (!p) return "Contact for price";
  const n = parseFloat(p);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "Contact for price";
}

function productUrl(permalink) {
  try {
    const u = new URL(permalink || AFFILIATE_URL);
    u.searchParams.set("ref", "SAMMYC");
    return u.toString();
  } catch { return AFFILIATE_URL; }
}

async function transformProduct(p) {
  const category = mapCategory(p.categories);
  const image    = p.images?.[0]?.src || null;
  const baseUrl  = productUrl(p.permalink);
  const results  = [];

  if (p.type === "variable") {
    const variations = await fetchVariations(p.id);
    if (variations.length === 0) {
      results.push({ product: p.name, listing: p.name, company: COMPANY, category,
        price: formatPrice(p.regular_price, p.sale_price), sku: p.sku,
        in_stock: p.stock_status === "instock", image, url: baseUrl, source: "api" });
    } else {
      for (const v of variations) {
        const attrs = (v.attributes || []).map(a => a.option).filter(Boolean).join(" / ");
        const listing = attrs ? `${p.name} - ${attrs}` : p.name;
        results.push({ product: p.name, listing, company: COMPANY, category,
          price: formatPrice(v.regular_price, v.sale_price), sku: v.sku || p.sku,
          in_stock: v.stock_status === "instock",
          image: v.image?.src || image, url: baseUrl, source: "api" });
      }
    }
  } else {
    results.push({ product: p.name, listing: p.name, company: COMPANY, category,
      price: formatPrice(p.regular_price, p.sale_price), sku: p.sku,
      in_stock: p.stock_status === "instock", image, url: baseUrl, source: "api" });
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
    const transformed = (await mapWithConcurrency(raw, VARIATION_CONCURRENCY, transformProduct)).flat();
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({
      vendor: COMPANY, fetched_at: new Date().toISOString(),
      count: transformed.length, products: transformed
    })};
  } catch (err) {
    console.error(`${COMPANY} feed error:`, err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
