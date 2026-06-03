import { classifyCatalogCategory } from "./_shared/product-normalizer.mjs";

const FEED_URL = "https://labsourced.com/api/public/products";

function formatPrice(value) {
  if (value === undefined || value === null || value === "") return "Contact for price";
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? `$${parsed.toFixed(2)}` : "Contact for price";
}

function withReferral(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("ref", "SammyC");
    return parsed.toString();
  } catch {
    return url;
  }
}

export const handler = async event => {
  const headers = {
    "Access-Control-Allow-Origin": "https://mypeptideprice.com",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300, stale-while-revalidate=21600",
    "Netlify-CDN-Cache-Control": "public, durable, max-age=900, stale-while-revalidate=21600"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    const response = await fetch(FEED_URL);
    if (!response.ok) throw new Error(`Feed error: ${response.status}`);
    const data = await response.json();
    const sourceProducts = Array.isArray(data.products) ? data.products : [];
    const products = sourceProducts.map((product, index) => {
      const productName = String(product.name || product.full_name || `Unnamed API Product ${product.id || index}`).trim();
      const listing = String(product.full_name || productName).trim();
      const rawCategory = String(product.category || product.type || "");
      return {
        product: productName,
        listing,
        raw_product: productName,
        raw_listing: listing,
        raw_category: rawCategory,
        company: "LabSourced Peptides",
        category: classifyCatalogCategory({ product: productName, listing, sku: product.sku, raw_category: rawCategory }),
        price: formatPrice(product.price),
        sku: product.sku || product.id || "",
        in_stock: typeof product.in_stock === "boolean" ? product.in_stock : null,
        url: withReferral(product.url),
        image: product.image || null,
        source: "api",
        source_slug: product.slug || "",
        source_type: "public_api_product",
        source_product_id: String(product.id || product.sku || product.slug || productName || index)
      };
    });
    const represented = new Set(products.map(product => product.source_product_id).filter(Boolean));
    const metadata = {
      source_product_count: sourceProducts.length,
      represented_source_products: represented.size,
      unrepresented_source_products: Math.max(0, sourceProducts.length - represented.size),
      explicit_exclusions: 0,
      variable_products: 0,
      variation_rows: 0,
      variation_fetch_errors: 0,
      transform_fallback_rows: 0,
      returned_rows: products.length,
      warnings: []
    };

    return { statusCode: 200, headers, body: JSON.stringify({ vendor: "LabSourced Peptides", fetched_at: data.generated_at || new Date().toISOString(), raw_count: sourceProducts.length, count: products.length, metadata, products }) };
  } catch (error) {
    console.error("LabSourced feed error:", error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
