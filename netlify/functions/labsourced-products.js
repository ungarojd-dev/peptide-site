// Netlify Serverless Function — LabSourced Peptides Product Feed
// Public API — no credentials needed
// Deployed at: https://mypeptideprice.com/.netlify/functions/labsourced-products

const FEED_URL    = "https://labsourced.com/api/public/products";
const COMPANY     = "LabSourced Peptides";
const FETCH_TIMEOUT = 15000;

function fetchWithTimeout(url, ms = FETCH_TIMEOUT) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

function mapCategory(name) {
  const n = (name || "").toLowerCase();
  if (/glp|semaglutide|tirzepatide|retatrutide|cagrilintide|cagri|mazdutide|orforglipron|survodutide|liraglutide|amycretin|weight|gla-[123]|ion-[123][str]|pep-(?:sm|tz|trz|rt)|tesofensine|metaboflex/.test(n)) return "GLP-1 & Incretin";
  if (/bpc|tb-500|tb500|wolverine|repair|kpv|ll-37|ll37/.test(n)) return "Repair & Recovery";
  if (/nad|epitalon|snap-8|tesamorelin|longevity|anti-ag|humanin|mtp-31/.test(n)) return "Longevity & Cellular Health";
  if (/semax|selank|dihexa|nootropic|cogni|cerebrolysin/.test(n)) return "Cognitive & Nootropic";
  if (/ipamorelin|cjc|ghrp|sermorelin|growth|igf|hexarelin|ghrh/.test(n)) return "Growth Hormone Research";
  if (/melanotan|pt-141|bremelanotide|kisspeptin|sexual|tanning|mt-[12]/.test(n)) return "Skin, Tanning & Sexual Health";
  if (/aod|mots|metabol|energy|lipo|slu-pp/.test(n)) return "Metabolic & Mitochondrial";
  if (/capsule|oral|tablet/.test(n)) return "Capsules";
  if (/water|bac|acetic|sterile|vial case|kit|suppl|l-carnitine/.test(n)) return "Supplies";
  return "Other";
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

    const products = (data.products || []).map(p => ({
      product:  p.name,
      listing:  p.full_name || p.name,
      company:  COMPANY,
      category: mapCategory(p.name),
      price:    `$${parseFloat(p.price).toFixed(2)}`,
      sku:      p.sku || p.id,
      in_stock: p.in_stock === true,
      url:      p.url ? `${p.url}?ref=SammyC` : null,
      image:    p.image || null,
      source:   "api"
    }));

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({
      vendor: COMPANY, fetched_at: data.generated_at || new Date().toISOString(),
      count: products.length, products
    })};
  } catch (err) {
    console.error(`${COMPANY} feed error:`, err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
