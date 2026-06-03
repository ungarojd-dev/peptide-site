// Netlify Serverless Function - Solyn Labs Product Feed
// Deployed at: https://mypeptideprice.com/.netlify/functions/solyn-products
// Requires Netlify environment variables: SOLYN_CK and SOLYN_CS

const CK = process.env.SOLYN_CK;
const CS = process.env.SOLYN_CS;
const BASE = "https://solyn.com/wp-json/wc/v3";

async function fetchJsonWithTimeout(url, ms = 7000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`WooCommerce API error: ${resp.status}`);
    return { resp, data: await resp.json() };
  } finally {
    clearTimeout(tid);
  }
}

async function fetchAllProducts() {
  let page = 1;
  let allProducts = [];

  while (true) {
    const params = new URLSearchParams({
      per_page: "100",
      page: String(page),
      status: "publish",
      consumer_key: CK,
      consumer_secret: CS
    });

    const { resp, data } = await fetchJsonWithTimeout(`${BASE}/products?${params.toString()}`);
    if (!Array.isArray(data) || data.length === 0) break;

    allProducts = allProducts.concat(data);
    const totalPages = parseInt(resp.headers.get("X-WP-TotalPages") || "1", 10);
    if (page >= totalPages) break;
    page += 1;
  }

  return allProducts;
}

async function fetchVariations(productId) {
  const params = new URLSearchParams({
    per_page: "100",
    consumer_key: CK,
    consumer_secret: CS
  });

  try {
    const { data } = await fetchJsonWithTimeout(`${BASE}/products/${productId}/variations?${params.toString()}`, 7000);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.log(`Solyn variation fetch skipped for ${productId}: ${err.message}`);
    return [];
  }
}

function textIncludesAny(text, terms) {
  return terms.some(term => text.includes(term));
}

function mapCategory(product) {
  const categoryText = (product.categories || []).map(c => c.name || "").join(" ").toLowerCase();
  const nameText = `${product.name || ""} ${product.sku || ""}`.toLowerCase();
  const text = `${categoryText} ${nameText}`;

  if (textIncludesAny(text, ["glp", "semaglutide", "tirzepatide", "retatrutide", "cagrilintide", "cagri", "mazdutide", "orforglipron", "survodutide", "liraglutide", "amycretin", "weight", "ion-1s", "ion-2t", "ion-3r", "sa-2t", "sa-3r", "sa-4c", "gla-1", "gla-2", "gla-3", "glp-1", "glp-2", "glp-3", "glp2-t", "glp3-r", "glp-t2", "glp-r3", "mhc-2", "oc-3rt", "pep-sm", "pep-trz", "pep-rt", "peptide-t", "peptide-r", "tesofensine", "metaboflex"])) return "GLP-1 & Incretin";
  if (textIncludesAny(text, ["bpc", "tb-500", "tb500", "repair", "recover", "healing", "kpv", "ll-37", "ll37", "thymosin"])) return "Repair & Recovery";
  if (textIncludesAny(text, ["nad", "epitalon", "epithalon", "snap-8", "humanin", "foxo4", "ss-31", "mtp", "longevity", "anti-aging", "anti aging"])) return "Longevity & Cellular Health";
  if (textIncludesAny(text, ["semax", "selank", "dihexa", "nootropic", "cognitive", "cerebrolysin", "vip"])) return "Cognitive & Nootropic";
  if (textIncludesAny(text, ["ipamorelin", "cjc", "ghrp", "ghrh", "sermorelin", "tesamorelin", "hexarelin", "igf", "growth hormone"])) return "Growth Hormone Research";
  if (textIncludesAny(text, ["melanotan", "mt-1", "mt-2", "pt-141", "bremelanotide", "kisspeptin", "sexual", "tanning"])) return "Skin, Tanning & Sexual Health";
  if (textIncludesAny(text, ["aod", "mots", "lipo", "metabolic", "mitochondrial", "energy", "5-amino", "tesofensine", "slu-pp"])) return "Metabolic & Mitochondrial";
  if (textIncludesAny(text, ["capsule", "capsules", "tablet", "tablets", "oral"])) return "Capsules";
  if (textIncludesAny(text, ["water", "bac", "bacteriostatic", "sterile", "syringe", "needle", "pen", "kit", "vial cover", "supplies"])) return "Supplies";
  return "Other";
}

function formatPrice(regular, sale, fallback) {
  const price = sale && sale !== "" ? sale : (regular && regular !== "" ? regular : fallback);
  if (!price || price === "") return "Contact for price";
  const parsed = parseFloat(price);
  return Number.isFinite(parsed) ? `$${parsed.toFixed(2)}` : "Contact for price";
}

function productUrl() {
  return "https://partner.solyn.com/?ref=SammyC";
}

async function transformProduct(product) {
  const category = mapCategory(product);
  const results = [];
  const image = product.images && product.images.length > 0 ? product.images[0].src : null;
  const baseUrl = productUrl();

  if (product.type === "variable") {
    const variations = await fetchVariations(product.id);

    if (variations.length === 0) {
      results.push({
        product: product.name,
        listing: product.name,
        company: "Solyn Labs",
        category,
        price: formatPrice(product.regular_price, product.sale_price, product.price),
        sku: product.sku,
        in_stock: product.stock_status === "instock",
        image,
        url: baseUrl,
        source: "api"
      });
      return results;
    }

    for (const variation of variations) {
      const attrs = (variation.attributes || []).map(a => a.option).filter(Boolean).join(" / ");
      const listing = attrs ? `${product.name} - ${attrs}` : product.name;
      const varImage = variation.image && variation.image.src ? variation.image.src : image;
      results.push({
        product: product.name,
        listing,
        company: "Solyn Labs",
        category,
        price: formatPrice(variation.regular_price, variation.sale_price, variation.price),
        sku: variation.sku || product.sku,
        in_stock: variation.stock_status === "instock",
        image: varImage,
        url: baseUrl,
        source: "api"
      });
    }

    return results;
  }

  results.push({
    product: product.name,
    listing: product.name,
    company: "Solyn Labs",
    category,
    price: formatPrice(product.regular_price, product.sale_price, product.price),
    sku: product.sku,
    in_stock: product.stock_status === "instock",
    image,
    url: baseUrl,
    source: "api"
  });

  return results;
}


async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        console.warn(`Skipped one product during vendor refresh: ${error.message}`);
        results[index] = [];
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
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

    const rawProducts = await fetchAllProducts();
    const transformed = (await mapWithConcurrency(rawProducts, 5, transformProduct)).flat();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        vendor: "Solyn Labs",
        fetched_at: new Date().toISOString(),
        count: transformed.length,
        products: transformed
      })
    };
  } catch (err) {
    console.error("Solyn Labs API error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
