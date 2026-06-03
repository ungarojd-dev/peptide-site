// Optional expanded WooCommerce feed for Flawless Compounds.
// This runs in parallel with the stable feed. If it fails, the browser keeps the stable snapshot.

const CK = process.env.FLAWLESS_CK;
const CS = process.env.FLAWLESS_CS;
const BASE = "https://flawlesscompounds.com/wp-json/wc/v3";
const COMPANY = "Flawless Compounds";
const DEFAULT_URL = "https://flawlesscompounds.com/shop/?coupon=SammyC";

async function fetchJson(url, ms = 7000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`WooCommerce API error: ${resp.status}`);
    return { resp, data: await resp.json() };
  } finally {
    clearTimeout(timer);
  }
}

function authParams(extra = {}) {
  return new URLSearchParams({ ...extra, consumer_key: CK, consumer_secret: CS });
}

async function fetchAllProducts() {
  const all = [];
  let page = 1;
  while (true) {
    const params = authParams({ per_page: "100", page: String(page), status: "publish" });
    const { resp, data } = await fetchJson(`${BASE}/products?${params.toString()}`);
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    const totalPages = parseInt(resp.headers.get("X-WP-TotalPages") || "1", 10);
    if (page >= totalPages) break;
    page += 1;
  }
  return all;
}

async function fetchVariations(productId) {
  const all = [];
  let page = 1;
  while (true) {
    try {
      const params = authParams({ per_page: "100", page: String(page) });
      const { resp, data } = await fetchJson(`${BASE}/products/${productId}/variations?${params.toString()}`);
      if (!Array.isArray(data) || data.length === 0) break;
      all.push(...data);
      const totalPages = parseInt(resp.headers.get("X-WP-TotalPages") || "1", 10);
      if (page >= totalPages) break;
      page += 1;
    } catch (error) {
      console.warn(`${COMPANY} variation fetch failed for ${productId}: ${error.message}`);
      return [];
    }
  }
  return all;
}

function textIncludesAny(text, terms) { return terms.some(term => text.includes(term)); }
function mapCategory(product) {
  const categoryText = (product.categories || []).map(c => c.name || "").join(" ").toLowerCase();
  const nameText = `${product.name || ""} ${product.sku || ""} ${product.slug || ""}`.toLowerCase();
  const text = `${categoryText} ${nameText}`;
  if (textIncludesAny(text,["glp","semaglutide","sema","tirzepatide","tirz","retatrutide","reta","cagrilintide","cagri","mazdutide","orforglipron","pep-sm","pep-tz","pep-trz","pep-rt","peptide sm","peptide tz","peptide rt"])) return "GLP-1 & Incretin";
  if (textIncludesAny(text,["bpc","tb-500","tb500","repair","recover","kpv","ll-37","wolverine"])) return "Repair & Recovery";
  if (textIncludesAny(text,["nad","epitalon","snap-8","foxo4","humanin","longevity","anti-aging"])) return "Longevity & Cellular Health";
  if (textIncludesAny(text,["semax","selank","dihexa","nootropic","cognitive","cerebrolysin","vip"])) return "Cognitive & Nootropic";
  if (textIncludesAny(text,["ipamorelin","cjc","ghrp","ghrh","sermorelin","tesamorelin","hexarelin","igf","growth hormone"])) return "Growth Hormone Research";
  if (textIncludesAny(text,["melanotan","mt-1","mt-2","pt-141","bremelanotide","kisspeptin","sexual","tanning"])) return "Skin, Tanning & Sexual Health";
  if (textIncludesAny(text,["aod","mots","ss-31","5-amino","slu-pp","lipo","metabolic","mitochondrial","energy"])) return "Metabolic & Mitochondrial";
  if (textIncludesAny(text,["capsule","tablet","oral"])) return "Capsules";
  if (textIncludesAny(text,["water","bac","bacteriostatic","sterile","syringe","needle","pen","kit","case","vial cap","suppl"])) return "Supplies";
  return "Other";
}

function formatPrice(regular, sale, fallback) {
  const price = sale && sale !== "" ? sale : (regular && regular !== "" ? regular : fallback);
  if (!price || price === "") return "Contact for price";
  const parsed = parseFloat(price);
  return Number.isFinite(parsed) ? `$${parsed.toFixed(2)}` : "Contact for price";
}

function parentRow(product, warning = "") {
  return {
    product: product.name,
    listing: product.name,
    company: COMPANY,
    category: mapCategory(product),
    price: formatPrice(product.regular_price, product.sale_price, product.price),
    sku: product.sku,
    in_stock: product.stock_status === "instock",
    url: product.permalink || DEFAULT_URL,
    source: "api-enrichment",
    enrichment_warning: warning
  };
}

async function transformProduct(product) {
  if (product.type !== "variable") return [parentRow(product)];
  const variations = await fetchVariations(product.id);
  if (!variations.length) return [parentRow(product, "Variation request returned no rows; parent kept")];
  const category = mapCategory(product);
  return variations.map(variation => {
    const attrs = (variation.attributes || []).map(a => a.option).filter(Boolean).join(" / ");
    return {
      product: product.name,
      listing: attrs ? `${product.name} - ${attrs}` : product.name,
      company: COMPANY,
      category,
      price: formatPrice(variation.regular_price, variation.sale_price, variation.price),
      sku: variation.sku || product.sku,
      in_stock: variation.stock_status === "instock",
      url: product.permalink || DEFAULT_URL,
      source: "api-enrichment"
    };
  });
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      const product = items[index];
      try { results[index] = await mapper(product); }
      catch (error) {
        console.warn(`${COMPANY} transform fallback for ${product && product.id}: ${error.message}`);
        results[index] = [parentRow(product || { name: "Untitled API Product" }, error.message)];
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return results;
}

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "https://mypeptideprice.com",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300, stale-while-revalidate=21600",
    "Netlify-CDN-Cache-Control": "public, durable, max-age=900, stale-while-revalidate=21600"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  try {
    if (!CK || !CS) throw new Error("API credentials not configured");
    const raw = await fetchAllProducts();
    const products = (await mapWithConcurrency(raw, 4, transformProduct)).flat();
    return { statusCode: 200, headers, body: JSON.stringify({ vendor: COMPANY, fetched_at: new Date().toISOString(), count: products.length, products }) };
  } catch (error) {
    console.error(`${COMPANY} expanded feed error:`, error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, products: [] }) };
  }
};
