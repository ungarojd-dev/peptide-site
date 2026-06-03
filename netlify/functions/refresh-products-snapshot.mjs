import { getStore } from "@netlify/blobs";
import { buildNormalizationDiagnostics } from "./_shared/product-normalizer.mjs";

const STORE_NAME = "mpp-product-snapshots";
const SNAPSHOT_KEY = "latest-v3";
const LEGACY_SNAPSHOT_KEY = "latest-v2";
const SITE_ORIGIN = (process.env.URL || "https://mypeptideprice.com").replace(/\/+$/, "");
const MIN_VENDOR_ROWS_FOR_RATIO_CHECK = 5;
const PARTIAL_FEED_RATIO = 0.5;

async function fetchJSONWithTimeout(url, ms = 45000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function groupByVendor(products = []) {
  const map = new Map();
  for (const product of products) {
    const vendor = product.company || "Unknown vendor";
    if (!map.has(vendor)) map.set(vendor, []);
    map.get(vendor).push(product);
  }
  return map;
}

export function mergeLastKnownGood(current, previous) {
  if (!previous || !Array.isArray(previous.products) || previous.products.length === 0) {
    return { products: current.products, preserved_vendors: [] };
  }

  const currentByVendor = groupByVendor(current.products);
  const previousByVendor = groupByVendor(previous.products);
  const feedDiagnostics = current.diagnostics?.feeds || {};
  const vendors = new Set([...currentByVendor.keys(), ...previousByVendor.keys(), ...Object.keys(feedDiagnostics)]);
  const products = [];
  const preservedVendors = [];

  for (const vendor of vendors) {
    const freshRows = currentByVendor.get(vendor) || [];
    const oldRows = previousByVendor.get(vendor) || [];
    const feed = feedDiagnostics[vendor];
    const failed = feed && feed.status !== "success";
    const suspiciousPartial = oldRows.length >= MIN_VENDOR_ROWS_FOR_RATIO_CHECK && freshRows.length < Math.max(3, Math.floor(oldRows.length * PARTIAL_FEED_RATIO));

    if (oldRows.length && (failed || freshRows.length === 0 || suspiciousPartial)) {
      products.push(...oldRows);
      preservedVendors.push({
        vendor,
        reason: failed ? "feed_error" : (freshRows.length === 0 ? "empty_feed" : "suspicious_partial_feed"),
        previous_count: oldRows.length,
        new_count: freshRows.length
      });
    } else {
      products.push(...freshRows);
    }
  }

  return { products, preserved_vendors: preservedVendors };
}

export default async () => {
  const started = Date.now();
  const store = getStore(STORE_NAME);
  let previous = null;

  try {
    previous = await store.get(SNAPSHOT_KEY, { type: "json" });
    if (!previous || !Array.isArray(previous.products) || previous.products.length === 0) {
      previous = await store.get(LEGACY_SNAPSHOT_KEY, { type: "json" });
      if (previous && Array.isArray(previous.products) && previous.products.length > 0) {
        console.log(`Using legacy snapshot as first-run safety net: ${previous.products.length} rows`);
      }
    }
  } catch (error) {
    console.warn("Previous snapshot read skipped:", error.message);
  }

  const snapshot = await fetchJSONWithTimeout(`${SITE_ORIGIN}/.netlify/functions/all-products?scheduled=${Date.now()}&fresh=1`, 45000);
  if (!snapshot || !Array.isArray(snapshot.products) || snapshot.products.length === 0) {
    throw new Error("Scheduled snapshot refresh returned no products");
  }

  const merged = mergeLastKnownGood(snapshot, previous);
  const diagnostics = buildNormalizationDiagnostics(merged.products, snapshot.diagnostics?.feeds || {});
  diagnostics.preserved_vendors = merged.preserved_vendors;

  const payload = {
    ...snapshot,
    schema_version: "ingestion-v3",
    products: merged.products,
    count: merged.products.length,
    diagnostics,
    snapshot_updated_at: new Date().toISOString(),
    snapshot_refresh_ms: Date.now() - started
  };

  await store.setJSON(SNAPSHOT_KEY, payload, {
    metadata: {
      updated_at: payload.snapshot_updated_at,
      count: payload.products.length,
      schema_version: payload.schema_version
    }
  });

  console.log(`Stored MPP product snapshot v3: ${payload.products.length} products in ${payload.snapshot_refresh_ms}ms`);
  if (merged.preserved_vendors.length) {
    console.warn("Preserved last-known-good vendor rows:", JSON.stringify(merged.preserved_vendors));
  }
};
