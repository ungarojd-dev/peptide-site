import { classifyCatalogCategory } from "./_shared/product-normalizer.mjs";

const FEED_URL = "https://instantpeptides.com/api/feeds/peptide-price";

function formatPrice(value) {
  if (value === undefined || value === null || value === "") return "Contact for price";
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? `$${parsed.toFixed(2)}` : "Contact for price";
}

function withReferral(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("ref", "SAMMYC");
    return parsed.toString();
  } catch {
    return url;
  }
}

function sourceId(product, index) {
  return String(product.id || product.sku || product.slug || product.name || `instant-${index}`);
}

function buildBase(product, index, warning = "") {
  const productName = String(product.name || `Unnamed API Product ${sourceId(product, index)}`).trim();
  const row = {
    product: productName,
    listing: productName,
    raw_product: productName,
    raw_listing: productName,
    raw_category: String(product.category || product.type || ""),
    company: "Instant Peptides",
    category: classifyCatalogCategory({ product: productName, listing: productName, raw_category: product.category || product.type || "" }),
    price: formatPrice(product.price),
    sku: product.sku || "",
    in_stock: typeof product.in_stock === "boolean" ? product.in_stock : null,
    url: withReferral(product.url),
    source: "api",
    source_slug: product.slug || "",
    source_type: "custom_feed_parent",
    source_product_id: sourceId(product, index)
  };
  if (warning) row.ingestion_warning = warning;
  return row;
}

function buildVariant(product, variant, index, variantIndex) {
  const base = buildBase(product, index);
  const size = `${variant.size ?? ""}${variant.unit ?? ""}`.trim();
  const quantity = Number(variant.pack_qty || 0) > 1 ? ` (${variant.pack_qty} vials)` : "";
  const detail = `${size}${quantity}`.trim();
  const listing = detail ? `${base.product} - ${detail}` : base.product;
  return {
    ...base,
    listing,
    raw_listing: listing,
    category: classifyCatalogCategory({ ...base, listing, raw_listing: listing, sku: variant.sku || base.sku }),
    price: formatPrice(variant.price),
    sku: variant.sku || `${variant.size ?? ""}${variant.unit ?? ""}-${variant.form || ""}-x${variant.pack_qty || 1}`,
    in_stock: typeof variant.in_stock === "boolean" ? variant.in_stock : null,
    source_type: "custom_feed_variant",
    source_variation_id: String(variant.id || `${base.source_product_id}-${variantIndex}`)
  };
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
    const products = [];
    const warnings = [];

    sourceProducts.forEach((product, index) => {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      if (!variants.length) {
        const warning = "custom_feed_product_has_no_variants_parent_retained";
        warnings.push({ source_product_id: sourceId(product, index), product: product.name || "", warning });
        products.push(buildBase(product, index, warning));
        return;
      }
      variants.forEach((variant, variantIndex) => products.push(buildVariant(product, variant, index, variantIndex)));
    });

    const represented = new Set(products.map(product => product.source_product_id).filter(Boolean));
    const metadata = {
      source_product_count: sourceProducts.length,
      represented_source_products: represented.size,
      unrepresented_source_products: Math.max(0, sourceProducts.length - represented.size),
      explicit_exclusions: 0,
      variable_products: sourceProducts.filter(product => Array.isArray(product.variants) && product.variants.length > 0).length,
      variation_rows: products.filter(product => product.source_type === "custom_feed_variant").length,
      variation_fetch_errors: 0,
      transform_fallback_rows: products.filter(product => product.ingestion_warning).length,
      returned_rows: products.length,
      warnings
    };

    return { statusCode: 200, headers, body: JSON.stringify({ vendor: "Instant Peptides", fetched_at: new Date().toISOString(), raw_count: sourceProducts.length, count: products.length, metadata, products }) };
  } catch (error) {
    console.error("Instant Peptides feed error:", error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
