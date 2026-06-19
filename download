import fallbackSnapshot from "../../data/catalog-fallback-snapshot.json" with { type: "json" };
import { readRawSnapshot, readRefreshStatus } from "./_shared/catalog-store.mjs";

function reply(body, status = 200, source = "blob") {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MPP-Catalog-Source": source } });
}

function authorized(request) {
  const expected = process.env.CATALOG_REFRESH_TOKEN;
  if (!expected) return false;
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return bearer === expected || request.headers.get("x-catalog-refresh-token") === expected;
}

function details(snapshot = {}, refreshStatus = null) {
  return {
    schema_version: snapshot.schema_version,
    engine_version: snapshot.engine_version,
    snapshot_updated_at: snapshot.snapshot_updated_at,
    snapshot_refresh_ms: snapshot.snapshot_refresh_ms,
    last_live_refresh_at: snapshot.last_live_refresh_at,
    product_card_count: snapshot.product_card_count,
    normalized_offer_count: snapshot.normalized_offer_count,
    vendors_loaded: snapshot.vendors_loaded,
    visible_unmapped_count: snapshot.visible_unmapped_count,
    excluded_count: snapshot.excluded_count,
    silent_drop_count: snapshot.silent_drop_count,
    refresh_status: refreshStatus,
    diagnostics: snapshot.diagnostics
  };
}

export default async request => {
  if (!authorized(request)) return reply({ error: "Unauthorized" }, 401, "protected");
  let refreshStatus = null;
  try { refreshStatus = await readRefreshStatus(); } catch (error) { console.warn("Catalog refresh status Blob unavailable:", error.message); }
  try {
    const snapshot = await readRawSnapshot();
    if (snapshot?.products?.length) return reply(details(snapshot, refreshStatus), 200, "blob");
  } catch (error) {
    console.warn("Catalog diagnostics Blob unavailable:", error.message);
  }
  return reply(details(fallbackSnapshot, refreshStatus), 200, "bundled-fallback");
};
