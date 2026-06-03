import { ENGINE_VERSION, buildCatalog } from "./catalog-v3-engine.mjs";

function flattenStoredRows(snapshot = {}) {
  const groups = snapshot.raw_offers_by_vendor || {};
  return Object.values(groups).flatMap(rows => Array.isArray(rows) ? rows : []);
}

export function snapshotNeedsReprocessing(snapshot = {}) {
  if (!snapshot || !Array.isArray(snapshot.products) || !snapshot.products.length) return false;
  if (snapshot.engine_version !== ENGINE_VERSION) return true;
  const diagnostics = snapshot.diagnostics || {};
  return diagnostics.mapped_offer_count == null || diagnostics.review_offer_count == null || diagnostics.excluded_count == null;
}

export function reprocessStoredSnapshot(snapshot = {}) {
  const rows = flattenStoredRows(snapshot);
  if (!rows.length) return null;
  const previousEngine = snapshot.engine_version || "unknown";
  const previousDiagnostics = snapshot.diagnostics || {};
  const warnings = [
    ...(previousDiagnostics.warnings || []),
    `Stored Catalog V3 rows were reprocessed with ${ENGINE_VERSION} after deployment`
  ];
  const rebuilt = buildCatalog(rows, {
    vendor_status: previousDiagnostics.vendor_status || {},
    warnings: [...new Set(warnings)]
  });
  const reprocessedAt = new Date().toISOString();
  return {
    ...rebuilt,
    snapshot_updated_at: reprocessedAt,
    snapshot_refresh_ms: 0,
    last_live_refresh_at: snapshot.last_live_refresh_at || snapshot.snapshot_updated_at || "",
    last_live_refresh_ms: snapshot.last_live_refresh_ms ?? snapshot.snapshot_refresh_ms ?? 0,
    snapshot_reprocessed_at: reprocessedAt,
    snapshot_reprocessed_from_engine_version: previousEngine,
    raw_offers_by_vendor: snapshot.raw_offers_by_vendor
  };
}
