// Netlify Serverless Function — Instant Peptides Product Feed
// Fetches from their custom JSON feed endpoint
// Deployed at: https://mypeptideprice.com/.netlify/functions/instant-products

const FEED_URL    = "https://instantpeptides.com/api/feeds/peptide-price";
const COMPANY     = "Instant Peptides";
const FETCH_TIMEOUT = 15000;

function fetchWithTimeout(url, ms = FETCH_TIMEOUT) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

function mapCategory(name) {
  const n = (name || "").toLowerCase();
  if (/glp|semaglutide|tirzepatide|retatrutide|cagrilintide|cagri|mazdutide|orforglipron|survodutide|liraglutide|amycretin|weight|gla-[123]|ion-[123][str]|pep-(?:sm|tz|trz|rt)|tesofensine|metaboflex/.test(n)) return "GLP-1 & Incretin";
  if (/bpc|tb-500|tb500|recover|heal|repair/.test(n)) return "Repair & Recovery";
  if (/nad|epitalon|longev|anti-ag|snap-8/.test(n)) return "Longevity & Cellular Health";
  if (/semax|selank|nootropic|cogni|dihexa/.test(n)) return "Cognitive & Nootropic";
  if (/ipamorelin|cjc|ghrp|growth|ghrh|igf|sermorelin/.test(n)) return "Growth Hormone Research";
  if (/melanotan|mt-|pt-141|bremelanotide|sexual|tann|kisspeptin/.test(n)) return "Skin, Tanning & Sexual Health";
  if (/aod|mots|metabol|energy|lipo/.test(n)) return "Metabolic & Mitochondrial";
  if (/capsule|oral|tablet/.test(n)) return "Capsules";
  if (/water|bac|acetic|sterile|vial|kit|suppl/.test(n)) return "Supplies";
  return "Other";
}

function buildListing(product, variant) {
  const qty = variant.pack_qty > 1 ? ` (${variant.pack_qty} vials)` : "";
  return `${product.name} - ${variant.size}${variant.unit}${qty}`;
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
    const resp = await fetchWithTimeout(FEED_URL);
    if (!resp.ok) throw new Error(`Feed error: ${resp.status}`);
    const data = await resp.json();

    const products = [];
    for (const p of data.products || []) {
      const category = mapCategory(p.name);
      for (const v of p.variants || []) {
        products.push({
          product:  p.name,
          listing:  buildListing(p, v),
          company:  COMPANY,
          category,
          price:    `$${parseFloat(v.price).toFixed(2)}`,
          sku:      `${v.size}${v.unit}-${v.form}-x${v.pack_qty}`,
          in_stock: v.in_stock === true,
          url:      p.url ? `${p.url}${p.url.includes("?") ? "&" : "?"}ref=SAMMYC` : null,
          source:   "api"
        });
      }
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({
      vendor: COMPANY, fetched_at: new Date().toISOString(),
      count: products.length, products
    })};
  } catch (err) {
    console.error(`${COMPANY} feed error:`, err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
