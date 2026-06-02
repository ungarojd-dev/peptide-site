// Netlify Serverless Function — Mile High Compounds Product Feed
// Deployed at: https://mypeptideprice.com/.netlify/functions/milehigh-products

const CK = process.env.MILEHIGH_CK;
const CS = process.env.MILEHIGH_CS;
const BASE = "https://milehighcompounds.is/wp-json/wc/v3";

async function fetchPage(url) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 9000);
  const resp = await fetch(url, {signal: ctrl.signal}).finally(() => clearTimeout(tid));
  if (!resp.ok) throw new Error(`WooCommerce API error: ${resp.status}`);
  const products = await resp.json();
  const totalPages = parseInt(resp.headers.get("X-WP-TotalPages") || "1");
  return { products, totalPages };
}

async function fetchAllProducts() {
  const baseUrl = `${BASE}/products?per_page=100&consumer_key=${CK}&consumer_secret=${CS}&status=publish`;
  const { products: page1, totalPages } = await fetchPage(`${baseUrl}&page=1`);
  if (totalPages <= 1) return page1;
  const pageNums = Array.from({length: totalPages - 1}, (_, i) => i + 2);
  const restResults = await Promise.allSettled(pageNums.map(n => fetchPage(`${baseUrl}&page=${n}`)));
  const allProducts = [...page1];
  for (const r of restResults) {
    if (r.status === "fulfilled") allProducts.push(...r.value.products);
  }
  return allProducts;
}

async function fetchVariations(productId) {
  const url = `${BASE}/products/${productId}/variations?per_page=100&consumer_key=${CK}&consumer_secret=${CS}`;
  const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 9000);
    const resp = await fetch(url, {signal: ctrl.signal}).finally(() => clearTimeout(tid));
  if (!resp.ok) return [];
  return await resp.json();
}

function mapCategory(wcCategories) {
  const joined = wcCategories.map(c => c.name.toLowerCase()).join(" ");
  if (joined.includes("glp") || joined.includes("weight") || joined.includes("semaglutide") || joined.includes("tirzepatide") || joined.includes("retatrutide") || joined.includes("cagri")) return "GLP-1 & Incretin";
  if (joined.includes("recover") || joined.includes("heal") || joined.includes("bpc") || joined.includes("tb-500") || joined.includes("repair")) return "Repair & Recovery";
  if (joined.includes("longev") || joined.includes("anti-ag") || joined.includes("nad") || joined.includes("epitalon")) return "Longevity & Cellular Health";
  if (joined.includes("cogni") || joined.includes("nootropic") || joined.includes("semax") || joined.includes("selank")) return "Cognitive & Nootropic";
  if (joined.includes("growth") || joined.includes("ghrp") || joined.includes("ghrh") || joined.includes("ipamorelin") || joined.includes("cjc")) return "Growth Hormone Research";
  if (joined.includes("sexual") || joined.includes("tann") || joined.includes("melanotan") || joined.includes("pt-141") || joined.includes("bremelanotide")) return "Skin, Tanning & Sexual Health";
  if (joined.includes("metabol") || joined.includes("energy") || joined.includes("aod") || joined.includes("mots")) return "Metabolic & Mitochondrial";
  if (joined.includes("capsule") || joined.includes("oral")) return "Capsules";
  if (joined.includes("suppl") || joined.includes("kit") || joined.includes("water") || joined.includes("bac")) return "Supplies";
  return "Other";
}

function formatPrice(regular, sale) {
  const price = sale && sale !== "" ? sale : regular;
  if (!price || price === "") return "Contact for price";
  return `$${parseFloat(price).toFixed(2)}`;
}

async function transformProduct(p) {
  const category = mapCategory(p.categories || []);
  const results = [];
  const image = p.images && p.images.length > 0 ? p.images[0].src : null;

  if (p.type === "variable") {
    const variations = await fetchVariations(p.id);
    if (variations.length === 0) {
      results.push({ product: p.name, listing: p.name, company: "Mile High Peptides", category, price: formatPrice(p.regular_price, p.sale_price), sku: p.sku, in_stock: p.stock_status === "instock", image, source: "api" });
    } else {
      for (const v of variations) {
        const attrs = (v.attributes || []).map(a => a.option).join(" / ");
        const name = attrs ? `${p.name} — ${attrs}` : p.name;
        const varImage = v.image && v.image.src ? v.image.src : image;
        results.push({ product: p.name, listing: name, company: "Mile High Peptides", category, price: formatPrice(v.regular_price, v.sale_price), sku: v.sku || p.sku, in_stock: v.stock_status === "instock", image: varImage, source: "api" });
      }
    }
  } else {
    results.push({ product: p.name, listing: p.name, company: "Mile High Peptides", category, price: formatPrice(p.regular_price, p.sale_price), sku: p.sku, in_stock: p.stock_status === "instock", image, source: "api" });
  }
  return results;
}

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "https://mypeptideprice.com",
    "Access-Control-Allow-Methods": "GET",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=900, stale-while-revalidate=21600"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  try {
    if (!CK || !CS) throw new Error("API credentials not configured");
    const rawProducts = await fetchAllProducts();
    const results = await Promise.allSettled(rawProducts.map(p => transformProduct(p)));
    const transformed = [];
    for (const r of results) {
      if (r.status === 'fulfilled') transformed.push(...r.value);
    }
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ vendor: "Mile High Peptides", fetched_at: new Date().toISOString(), count: transformed.length, products: transformed })
    };
  } catch (err) {
    console.error("Mile High API error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
