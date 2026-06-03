// Combined product feed. Every row returned by a vendor adapter is retained and normalized.
// The snapshot layer consumes this endpoint. Diagnostics expose any upstream coverage gaps.

import { normalizeProduct, buildNormalizationDiagnostics } from "./_shared/product-normalizer.mjs";

const FEEDS = [
  { vendor: "Glacier Aminos", path: "/.netlify/functions/glacier-products" },
  { vendor: "Ion Peptide", path: "/.netlify/functions/ion-products" },
  { vendor: "Southern Aminos", path: "/.netlify/functions/southern-products" },
  { vendor: "Flawless Compounds", path: "/.netlify/functions/flawless-products" },
  { vendor: "Glow Aminos", path: "/.netlify/functions/glow-products" },
  { vendor: "Mile High Peptides", path: "/.netlify/functions/milehigh-products" },
  { vendor: "Instant Peptides", path: "/.netlify/functions/instant-products" },
  { vendor: "LabSourced Peptides", path: "/.netlify/functions/labsourced-products" },
  { vendor: "Solyn Labs", path: "/.netlify/functions/solyn-products" },
  { vendor: "Oneday Compounds", path: "/.netlify/functions/oneday-products" }
];

function getOrigin(event) {
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers.host || "mypeptideprice.com";
  return `${proto}://${host}`;
}

function safeValue(value, fallback = "") {
  if (value === undefined || value === null || value === "") return fallback;
  return value;
}

function slimProduct(product = {}, vendor = "Unknown vendor", index = 0) {
  const normalized = normalizeProduct({
    ...product,
    company: product.company || vendor,
    product: product.product || product.name || product.title || product.listing || `Unnamed API Product ${index + 1}`,
    listing: product.listing || product.product || product.name || product.title || `Unnamed API Product ${index + 1}`
  });

  return {
    product: normalized.product,
    listing: normalized.listing,
    raw_product: normalized.raw_product,
    raw_listing: normalized.raw_listing,
    company: normalized.company || vendor,
    category: normalized.category || "Other",
    format: normalized.format,
    raw_category: normalized.raw_category,
    canonical_family: normalized.canonical_family,
    components: normalized.components,
    normalization_status: normalized.normalization_status,
    price: safeValue(normalized.price, "Contact for price"),
    sale_price: normalized.sale_price,
    sku: normalized.sku || "",
    in_stock: typeof normalized.in_stock === "boolean" ? normalized.in_stock : null,
    url: normalized.url || "",
    source: normalized.source || "api",
    source_slug: normalized.source_slug || "",
    source_type: normalized.source_type || "",
    source_product_id: normalized.source_product_id || "",
    source_variation_id: normalized.source_variation_id || "",
    ingestion_warning: normalized.ingestion_warning || ""
  };
}

async function fetchJsonWithTimeout(url, ms = 7000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const response = await fetch(url, { signal: ctrl.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
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

  const origin = getOrigin(event);
  const started = Date.now();
  const forceFresh = event.queryStringParameters?.fresh === "1" || Boolean(event.queryStringParameters?.scheduled);
  const refreshToken = forceFresh ? `?refresh=${Date.now()}` : "";
  const feedTimeout = forceFresh ? 45000 : 12000;

  const settled = await Promise.allSettled(
    FEEDS.map(async feed => {
      const feedStarted = Date.now();
      const data = await fetchJsonWithTimeout(`${origin}${feed.path}${refreshToken}`, feedTimeout);
      const products = Array.isArray(data.products) ? data.products : [];
      const metadata = data.metadata || {};
      return {
        vendor: feed.vendor,
        source_product_count: Number(data.raw_count ?? metadata.source_product_count ?? products.length),
        returned_row_count: products.length,
        metadata,
        elapsed_ms: Date.now() - feedStarted,
        products
      };
    })
  );

  const products = [];
  const vendors = [];
  const errors = [];
  const feedDiagnostics = {};

  settled.forEach((result, index) => {
    const feed = FEEDS[index];
    if (result.status === "fulfilled") {
      const normalizedRows = result.value.products.map((product, rowIndex) => slimProduct(product, feed.vendor, rowIndex));
      vendors.push(feed.vendor);
      products.push(...normalizedRows);
      const metadata = result.value.metadata || {};
      feedDiagnostics[feed.vendor] = {
        status: normalizedRows.length > 0 || result.value.source_product_count === 0 ? "success" : "error",
        source_product_count: result.value.source_product_count,
        returned_row_count: result.value.returned_row_count,
        normalized_count: normalizedRows.length,
        represented_source_products: Number(metadata.represented_source_products ?? result.value.source_product_count),
        unrepresented_source_products: Number(metadata.unrepresented_source_products || 0),
        explicit_exclusions: Number(metadata.explicit_exclusions || 0),
        variable_products: Number(metadata.variable_products || 0),
        variation_rows: Number(metadata.variation_rows || 0),
        variation_fetch_errors: Number(metadata.variation_fetch_errors || 0),
        transform_fallback_rows: Number(metadata.transform_fallback_rows || 0),
        warnings: Array.isArray(metadata.warnings) ? metadata.warnings.slice(0, 300) : [],
        elapsed_ms: result.value.elapsed_ms
      };
      if (result.value.source_product_count > 0 && normalizedRows.length === 0) {
        errors.push({ vendor: feed.vendor, error: "Source feed returned products but adapter returned zero rows" });
      }
      return;
    }

    const message = result.reason?.message || "Unknown feed error";
    errors.push({ vendor: feed.vendor, error: message });
    feedDiagnostics[feed.vendor] = {
      status: "error",
      source_product_count: 0,
      returned_row_count: 0,
      normalized_count: 0,
      represented_source_products: 0,
      unrepresented_source_products: 0,
      explicit_exclusions: 0,
      variable_products: 0,
      variation_rows: 0,
      variation_fetch_errors: 0,
      transform_fallback_rows: 0,
      warnings: [],
      elapsed_ms: null,
      error: message
    };
  });

  const diagnostics = buildNormalizationDiagnostics(products, feedDiagnostics);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      schema_version: "ingestion-v3",
      fetched_at: new Date().toISOString(),
      elapsed_ms: Date.now() - started,
      count: products.length,
      vendors,
      errors,
      diagnostics,
      products
    })
  };
};
