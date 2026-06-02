// Netlify Serverless Function - Oneday Compounds Product Feed
// Deployed at: https://mypeptideprice.com/.netlify/functions/oneday-products
// Requires Netlify environment variables: ONEDAY_CK and ONEDAY_CS
// Optional environment variables: ONEDAY_BASE_URL and ONEDAY_AFFILIATE_URL

const CK = process.env.ONEDAY_CK;
const CS = process.env.ONEDAY_CS;
const SITE = (process.env.ONEDAY_BASE_URL || "https://onedaycompounds.net").replace(/\/+$/, "");
const BASE = `${SITE}/wp-json/wc/v3`;
const AFFILIATE_URL = process.env.ONEDAY_AFFILIATE_URL || `${SITE}/?ref=subileue`;

async function fetchJsonWithTimeout(url, ms = 9000) {
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
    const { data } = await fetchJsonWithTimeout(`${BASE}/products/${productId}/variations?${params.toString()}`, 9000);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.log(`Oneday variation fetch skipped for ${productId}: ${err.message}`);
    return [];
  }
}

function textIncludesAny(text, terms) {
  return terms.some(term => text.includes(term));
}


function shouldExcludeProduct(product) {
  const categoryText = (product.categories || []).map(c => c.name || "").join(" ").toLowerCase();
  const nameText = `${product.name || ""} ${product.sku || ""} ${product.slug || ""} ${product.permalink || ""}`.toLowerCase();
  const text = `${categoryText} ${nameText}`;

  return textIncludesAny(text, [
    "ship safely",
    "shipping protection",
    "shipping insurance",
    "package protection",
    "route protection",
    "gift card",
    "giftcard",
    "gift certificate"
  ]);
}

function mapCategory(product) {
  const categoryText = (product.categories || []).map(c => c.name || "").join(" ").toLowerCase();
  const nameText = `${product.name || ""} ${product.sku || ""}`.toLowerCase();
  const text = `${categoryText} ${nameText}`;

  if (textIncludesAny(text, ["glp", "semaglutide", "tirzepatide", "retatrutide", "cagrilintide", "cagri", "mazdutide", "orforglipron", "weight"])) return "GLP-1 & Incretin";
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

function productUrl(permalink) {
  const href = permalink || AFFILIATE_URL;
  try {
    const url = new URL(href);
    url.searchParams.set("ref", "subileue");
    return url.toString();
  } catch (err) {
    return AFFILIATE_URL;
  }
}

async function transformProduct(product) {
  const category = mapCategory(product);
  const results = [];
  const image = product.images && product.images.length > 0 ? product.images[0].src : null;
  const baseUrl = productUrl(product.permalink);

  if (product.type === "variable") {
    const variations = await fetchVariations(product.id);

    if (variations.length === 0) {
      results.push({
        product: product.name,
        listing: product.name,
        company: "Oneday Compounds",
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
        company: "Oneday Compounds",
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
    company: "Oneday Compounds",
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

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "https://mypeptideprice.com",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=900, stale-while-revalidate=21600"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    if (!CK || !CS) throw new Error("API credentials not configured");

    const rawProducts = await fetchAllProducts();
    const filtered = rawProducts.filter(p => !shouldExcludeProduct(p));
    const results = await Promise.allSettled(filtered.map(p => transformProduct(p)));
    const transformed = [];
    for (const r of results) {
      if (r.status === 'fulfilled') transformed.push(...r.value);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        vendor: "Oneday Compounds",
        fetched_at: new Date().toISOString(),
        count: transformed.length,
        products: transformed
      })
    };
  } catch (err) {
    console.error("Oneday Compounds API error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
