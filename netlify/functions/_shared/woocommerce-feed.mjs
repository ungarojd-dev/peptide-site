// Shared WooCommerce adapter used by all WooCommerce vendors.
// Contract: every published source product is represented by at least one output row.
// Variable products expose all variation pages. If variation loading fails, the parent row is retained with a warning.

import { classifyCatalogCategory } from "./product-normalizer.mjs";

function safeText(value) {
  return String(value || "").trim();
}

function sourceCategory(product) {
  return (product.categories || []).map(category => category.name || "").filter(Boolean).join(" / ");
}

function formatPrice(regular, sale, fallback) {
  const price = sale && sale !== "" ? sale : (regular && regular !== "" ? regular : fallback);
  if (price === undefined || price === null || price === "") return "Contact for price";
  const parsed = parseFloat(price);
  return Number.isFinite(parsed) ? `$${parsed.toFixed(2)}` : "Contact for price";
}

function defaultProductUrl(product) {
  return product.permalink || "";
}

function buildBaseRow(config, product, warning = "") {
  const rawCategory = sourceCategory(product);
  const productName = safeText(product.name) || `Unnamed API Product ${product.id || ""}`.trim();
  const listing = productName;
  const row = {
    company: config.vendor,
    product: productName,
    listing,
    raw_product: productName,
    raw_listing: listing,
    raw_category: rawCategory,
    category: classifyCatalogCategory({ product: productName, listing, sku: product.sku, slug: product.slug, raw_category: rawCategory }),
    price: formatPrice(product.regular_price, product.sale_price, product.price),
    sku: product.sku || "",
    in_stock: product.stock_status === "instock",
    image: product.images && product.images[0] ? product.images[0].src : null,
    url: (config.productUrl || defaultProductUrl)(product),
    source: "api",
    source_slug: product.slug || "",
    source_type: product.type || "simple",
    source_product_id: String(product.id || "")
  };
  if (warning) row.ingestion_warning = warning;
  return row;
}

async function fetchJsonWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const response = await fetch(url, { signal: ctrl.signal });
    if (!response.ok) throw new Error(`WooCommerce API error: ${response.status}`);
    return { response, data: await response.json() };
  } finally {
    clearTimeout(timer);
  }
}

function credentials(config) {
  return { ck: process.env[config.ckEnv], cs: process.env[config.csEnv] };
}

function buildParams({ ck, cs }, extra = {}) {
  return new URLSearchParams({
    per_page: "100",
    consumer_key: ck,
    consumer_secret: cs,
    ...extra
  });
}

async function fetchAllProducts(config, auth) {
  const products = [];
  let page = 1;
  while (true) {
    const params = buildParams(auth, { page: String(page), status: "publish" });
    const { response, data } = await fetchJsonWithTimeout(`${config.base}/products?${params}`, config.timeoutMs);
    if (!Array.isArray(data) || data.length === 0) break;
    products.push(...data);
    const totalPages = parseInt(response.headers.get("X-WP-TotalPages") || "1", 10);
    if (page >= totalPages) break;
    page += 1;
  }
  return products;
}

async function fetchAllVariations(config, auth, productId) {
  const variations = [];
  let page = 1;
  while (true) {
    const params = buildParams(auth, { page: String(page), status: "publish" });
    const { response, data } = await fetchJsonWithTimeout(`${config.base}/products/${productId}/variations?${params}`, config.variationTimeoutMs);
    if (!Array.isArray(data) || data.length === 0) break;
    variations.push(...data);
    const totalPages = parseInt(response.headers.get("X-WP-TotalPages") || "1", 10);
    if (page >= totalPages) break;
    page += 1;
  }
  return variations;
}

function buildVariationRow(config, product, variation) {
  const parent = buildBaseRow(config, product);
  const attrs = (variation.attributes || []).map(attribute => attribute.option).filter(Boolean).join(" / ");
  const listing = attrs ? `${parent.raw_product} - ${attrs}` : parent.raw_product;
  return {
    ...parent,
    listing,
    raw_listing: listing,
    category: classifyCatalogCategory({ ...parent, listing, raw_listing: listing, sku: variation.sku || parent.sku }),
    price: formatPrice(variation.regular_price, variation.sale_price, variation.price),
    sku: variation.sku || parent.sku,
    in_stock: variation.stock_status === "instock",
    image: variation.image && variation.image.src ? variation.image.src : parent.image,
    source_type: "variation",
    source_variation_id: String(variation.id || "")
  };
}

async function mapWithConcurrency(items, limit, mapper, fallback) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      try {
        results[current] = await mapper(items[current], current);
      } catch (error) {
        results[current] = [fallback(items[current], error)];
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, () => worker()));
  return results;
}

export function createWooCommerceHandler(options) {
  const config = {
    timeoutMs: 10000,
    variationTimeoutMs: 10000,
    concurrency: 5,
    productUrl: defaultProductUrl,
    ...options
  };

  return async function handler(event) {
    const headers = {
      "Access-Control-Allow-Origin": "https://mypeptideprice.com",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=21600",
      "Netlify-CDN-Cache-Control": "public, durable, max-age=900, stale-while-revalidate=21600"
    };
    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

    try {
      const auth = credentials(config);
      if (!auth.ck || !auth.cs) throw new Error("API credentials not configured");

      const rawProducts = await fetchAllProducts(config, auth);
      const stats = {
        source_product_count: rawProducts.length,
        represented_source_products: 0,
        unrepresented_source_products: 0,
        explicit_exclusions: 0,
        variable_products: rawProducts.filter(product => product.type === "variable").length,
        variation_rows: 0,
        variation_fetch_errors: 0,
        transform_fallback_rows: 0,
        returned_rows: 0,
        warnings: []
      };

      const transformProduct = async product => {
        if (product.type !== "variable") return [buildBaseRow(config, product)];
        try {
          const variations = await fetchAllVariations(config, auth, product.id);
          if (!variations.length) {
            stats.warnings.push({ source_product_id: String(product.id || ""), product: product.name || "", warning: "variable_product_returned_no_variations_parent_retained" });
            return [buildBaseRow(config, product, "variable_product_returned_no_variations_parent_retained")];
          }
          stats.variation_rows += variations.length;
          return variations.map(variation => buildVariationRow(config, product, variation));
        } catch (error) {
          stats.variation_fetch_errors += 1;
          stats.warnings.push({ source_product_id: String(product.id || ""), product: product.name || "", warning: `variation_fetch_failed_parent_retained: ${error.message}` });
          return [buildBaseRow(config, product, `variation_fetch_failed_parent_retained: ${error.message}`)];
        }
      };

      const nested = await mapWithConcurrency(rawProducts, config.concurrency, transformProduct, (product, error) => {
        stats.transform_fallback_rows += 1;
        stats.warnings.push({ source_product_id: String(product.id || ""), product: product.name || "", warning: `transform_failed_parent_retained: ${error.message}` });
        return buildBaseRow(config, product, `transform_failed_parent_retained: ${error.message}`);
      });
      const products = nested.flat();
      const represented = new Set(products.map(row => row.source_product_id).filter(Boolean));
      stats.represented_source_products = represented.size;
      stats.unrepresented_source_products = Math.max(0, rawProducts.length - represented.size);
      stats.returned_rows = products.length;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          vendor: config.vendor,
          fetched_at: new Date().toISOString(),
          raw_count: rawProducts.length,
          count: products.length,
          metadata: stats,
          products
        })
      };
    } catch (error) {
      console.error(`${config.vendor} API error:`, error.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
  };
}
