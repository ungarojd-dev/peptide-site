import fallbackPayload from "../../../data/catalog-fallback.json" with { type: "json" };
import { buildCatalog } from "./catalog-engine.mjs";
import { VENDOR_ADAPTERS } from "./vendor-adapters.mjs";

function compact(value) {
  return value == null ? "" : String(value).trim();
}

function withLayer(rows, sourceLayer) {
  return (rows || []).map(row => ({ ...row, source_layer: sourceLayer }));
}

function fallbackByVendor() {
  const result = {};
  for (const row of fallbackPayload.products || []) {
    const vendor = compact(row.company || "Unknown vendor");
    if (!result[vendor]) result[vendor] = [];
    result[vendor].push({ ...row, source_layer: "fallback-static" });
  }
  return result;
}

const STATIC_FALLBACK = fallbackByVendor();

export async function refreshCatalog(previousSnapshot = null) {
  const started = Date.now();
  const previous = previousSnapshot?.raw_offers_by_vendor || {};
  const rawOffersByVendor = {};
  const vendorStatus = {};
  const warnings = [];

  const settled = await Promise.allSettled(VENDOR_ADAPTERS.map(adapter => adapter.load()));

  settled.forEach((result, index) => {
    const adapter = VENDOR_ADAPTERS[index];
    if (result.status === "fulfilled" && result.value.products.length) {
      rawOffersByVendor[adapter.vendor] = withLayer(result.value.products, "live-api");
      vendorStatus[adapter.vendor] = {
        status: "live",
        row_count: result.value.products.length,
        fetched_at: result.value.fetched_at,
        metadata: result.value.metadata || {}
      };
      return;
    }

    const error = result.status === "rejected" ? result.reason.message : "No products returned";
    const staleRows = Array.isArray(previous[adapter.vendor]) ? previous[adapter.vendor] : [];
    if (staleRows.length) {
      rawOffersByVendor[adapter.vendor] = withLayer(staleRows, "stale-previous-snapshot");
      vendorStatus[adapter.vendor] = { status: "stale_previous_snapshot", row_count: staleRows.length, error };
      warnings.push(`${adapter.vendor}: live feed failed, retained previous successful rows`);
      return;
    }

    const fallbackRows = Array.isArray(STATIC_FALLBACK[adapter.vendor]) ? STATIC_FALLBACK[adapter.vendor] : [];
    rawOffersByVendor[adapter.vendor] = withLayer(fallbackRows, "fallback-static");
    vendorStatus[adapter.vendor] = { status: fallbackRows.length ? "fallback_static" : "empty", row_count: fallbackRows.length, error };
    warnings.push(`${adapter.vendor}: live feed failed, using bundled fallback rows`);
  });

  const catalog = buildCatalog(Object.values(rawOffersByVendor).flat(), { vendor_status: vendorStatus, warnings });
  const now = new Date().toISOString();
  return {
    ...catalog,
    snapshot_updated_at: now,
    snapshot_refresh_ms: Date.now() - started,
    last_live_refresh_at: now,
    raw_offers_by_vendor: rawOffersByVendor
  };
}
