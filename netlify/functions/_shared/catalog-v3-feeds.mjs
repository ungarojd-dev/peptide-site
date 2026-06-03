import fallbackPayload from "../../../data/catalog-v3-fallback.json" with { type: "json" };
import { buildCatalog } from "./catalog-v3-engine.mjs";

export const V3_FEEDS = [
  { vendor: "Glacier Aminos", paths: ["/.netlify/functions/glacier-products"] },
  { vendor: "Ion Peptide", paths: ["/.netlify/functions/ion-products"] },
  { vendor: "Southern Aminos", paths: ["/.netlify/functions/southern-products"] },
  { vendor: "Flawless Compounds", paths: ["/.netlify/functions/flawless-expanded-products", "/.netlify/functions/flawless-products"] },
  { vendor: "Glow Aminos", paths: ["/.netlify/functions/glow-expanded-products", "/.netlify/functions/glow-products"] },
  { vendor: "Mile High Peptides", paths: ["/.netlify/functions/milehigh-products"] },
  { vendor: "Instant Peptides", paths: ["/.netlify/functions/instant-products"] },
  { vendor: "LabSourced Peptides", paths: ["/.netlify/functions/labsourced-products"] },
  { vendor: "Solyn Labs", paths: ["/.netlify/functions/solyn-products"] },
  { vendor: "Oneday Compounds", paths: ["/.netlify/functions/oneday-products"] }
];

function compact(value) {
  return value == null ? "" : String(value).trim();
}
function addLayer(rows, layer) {
  return (rows || []).map(row => ({ ...row, source_layer: layer }));
}
function fallbackRowsByVendor() {
  const out = {};
  for (const row of fallbackPayload.products || []) {
    const vendor = compact(row.company || "Unknown vendor");
    if (!out[vendor]) out[vendor] = [];
    out[vendor].push({ ...row, source_layer: "fallback-static" });
  }
  return out;
}
const STATIC_FALLBACK = fallbackRowsByVendor();

async function fetchJSON(url, timeoutMs = 14000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: ctrl.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadVendorFeed(origin, feed, timeoutMs) {
  const errors = [];
  for (const path of feed.paths) {
    try {
      const payload = await fetchJSON(`${origin}${path}?catalog_v3=${Date.now()}`, timeoutMs);
      const products = Array.isArray(payload.products) ? payload.products : [];
      if (!products.length) throw new Error("No products returned");
      return { vendor: feed.vendor, products, path, metadata: payload.metadata || {}, fetched_at: payload.fetched_at || "", errors };
    } catch (error) {
      errors.push({ path, error: error.message });
    }
  }
  const message = errors.map(item => `${item.path}: ${item.error}`).join(" | ") || "Feed failed";
  throw new Error(message);
}

export async function buildFreshCatalog({ origin, previousSnapshot = null, timeoutMs = 14000 } = {}) {
  const started = Date.now();
  const previous = previousSnapshot && previousSnapshot.raw_offers_by_vendor ? previousSnapshot.raw_offers_by_vendor : {};
  const rowsByVendor = {};
  const vendorStatus = {};
  const warnings = [];

  const settled = await Promise.allSettled(V3_FEEDS.map(feed => loadVendorFeed(origin, feed, timeoutMs)));

  settled.forEach((result, index) => {
    const feed = V3_FEEDS[index];
    if (result.status === "fulfilled") {
      rowsByVendor[feed.vendor] = addLayer(result.value.products, "live-api");
      vendorStatus[feed.vendor] = {
        status: "live",
        row_count: result.value.products.length,
        path: result.value.path,
        fetched_at: result.value.fetched_at,
        fallback_attempts: result.value.errors
      };
      return;
    }

    const staleRows = Array.isArray(previous[feed.vendor]) ? previous[feed.vendor] : [];
    if (staleRows.length) {
      rowsByVendor[feed.vendor] = addLayer(staleRows, "stale-previous-snapshot");
      vendorStatus[feed.vendor] = {
        status: "stale_previous_snapshot",
        row_count: staleRows.length,
        error: result.reason.message
      };
      warnings.push(`${feed.vendor}: live feed failed, retained previous successful rows`);
      return;
    }

    const staticRows = Array.isArray(STATIC_FALLBACK[feed.vendor]) ? STATIC_FALLBACK[feed.vendor] : [];
    rowsByVendor[feed.vendor] = addLayer(staticRows, "fallback-static");
    vendorStatus[feed.vendor] = {
      status: staticRows.length ? "fallback_static" : "empty",
      row_count: staticRows.length,
      error: result.reason.message
    };
    warnings.push(`${feed.vendor}: live feed failed, using bundled fallback rows`);
  });

  const rows = Object.values(rowsByVendor).flat();
  const catalog = buildCatalog(rows, { vendor_status: vendorStatus, warnings });
  return {
    ...catalog,
    snapshot_updated_at: new Date().toISOString(),
    snapshot_refresh_ms: Date.now() - started,
    raw_offers_by_vendor: rowsByVendor
  };
}
