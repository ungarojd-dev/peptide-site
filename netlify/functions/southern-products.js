// Netlify Serverless Function — Southern Aminos Product Feed
// Proxies WooCommerce REST API so credentials are never exposed in browser
// Deployed at: https://mypeptideprice.com/.netlify/functions/southern-products

const CK = process.env.SOUTHERN_CK;
const CS = process.env.SOUTHERN_CS;
const BASE = "https://southernaminos.com/wp-json/wc/v3";

async function fetchAllProducts() {
  let page = 1;
  let allProducts = [];

  while (true) {
    const url = `${BASE}/products?per_page=100&page=${page}&consumer_key=${CK}&consumer_secret=${CS}&status=publish`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 9000);
    const resp = await fetch(url, {signal: ctrl.signal}).finally(() => clearTimeout(tid));

    if (!resp.ok) {
      throw new Error(`WooCommerce API error: ${resp.status}`);
    }

    const products = await resp.json();
    if (products.length === 0) break;

    allProducts = allProducts.concat(products);

    const totalPages = parseInt(resp.headers.get("X-WP-TotalPages") || "1");
    if (page >= totalPages) break;
    page++;
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
  const names = wcCategories.map(c => c.name.toLowerCase());
  const joined = names.join(" ");

  if (joined.includes("glp") || joined.includes("weight") || joined.includes("semaglutide") || joined.includes("tirzepatide") || joined.includes("retatrutide") || joined.includes("cagri")) {
    return "GLP-1 & Incretin";
  }
  if (joined.includes("recover") || joined.includes("heal") || joined.includes("bpc") || joined.includes("tb-500") || joined.includes("repair")) {
    return "Repair & Recovery";
  }
  if (joined.includes("longev") || joined.includes("anti-ag") || joined.includes("nad") || joined.includes("epitalon")) {
    return "Longevity & Cellular Health";
  }
  if (joined.includes("cogni") || joined.includes("nootropic") || joined.includes("semax") || joined.includes("selank")) {
    return "Cognitive & Nootropic";
  }
  if (joined.includes("growth") || joined.includes("ghrp") || joined.includes("ghrh") || joined.includes("ipamorelin") || joined.includes("cjc")) {
    return "Growth Hormone Research";
  }
  if (joined.includes("sexual") || joined.includes("tann") || joined.includes("melanotan") || joined.includes("pt-141") || joined.includes("bremelanotide")) {
    return "Skin, Tanning & Sexual Health";
  }
  if (joined.includes("metabol") || joined.includes("energy") || joined.includes("aod") || joined.includes("mots")) {
    return "Metabolic & Mitochondrial";
  }
  if (joined.includes("capsule") || joined.includes("oral")) {
    return "Capsules";
  }
  if (joined.includes("suppl") || joined.includes("kit") || joined.includes("water") || joined.includes("bac")) {
    return "Supplies";
  }
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
      results.push({
        product: p.name,
        listing: p.name,
        company: "Southern Aminos",
        category,
        price: formatPrice(p.regular_price, p.sale_price),
        sku: p.sku,
        in_stock: p.stock_status === "instock",
        image,
        source: "api"
      });
    } else {
      for (const v of variations) {
        const attrs = (v.attributes || []).map(a => a.option).join(" / ");
        const name = attrs ? `${p.name} — ${attrs}` : p.name;
        const varImage = v.image && v.image.src ? v.image.src : image;
        results.push({
          product: p.name,
          listing: name,
          company: "Southern Aminos",
          category,
          price: formatPrice(v.regular_price, v.sale_price),
          sku: v.sku || p.sku,
          in_stock: v.stock_status === "instock",
          image: varImage,
          source: "api"
        });
      }
    }
  } else {
    results.push({
      product: p.name,
      listing: p.name,
      company: "Southern Aminos",
      category,
      price: formatPrice(p.regular_price, p.sale_price),
      sku: p.sku,
      in_stock: p.stock_status === "instock",
      image,
      source: "api"
    });
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

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    if (!CK || !CS) {
      throw new Error("API credentials not configured");
    }

    const rawProducts = await fetchAllProducts();
    const transformed = [];

    for (const p of rawProducts) {
      const items = await transformProduct(p);
      transformed.push(...items);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        vendor: "Southern Aminos",
        fetched_at: new Date().toISOString(),
        count: transformed.length,
        products: transformed
      })
    };

  } catch (err) {
    console.error("Southern Aminos API error:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
