import fallbackSnapshot from "../../data/catalog-v3-fallback-snapshot.json" with { type: "json" };
import { readCatalogV3Snapshot } from "./_shared/catalog-v3-store.mjs";

function response(body, status = 200, source = "blob") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "https://mypeptideprice.com",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MPP-Catalog-V3-Source": source
    }
  });
}

function diagnosticPayload(snapshot = {}) {
  return {
    schema_version: snapshot.schema_version,
    engine_version: snapshot.engine_version,
    snapshot_updated_at: snapshot.snapshot_updated_at,
    snapshot_refresh_ms: snapshot.snapshot_refresh_ms,
    last_live_refresh_at: snapshot.last_live_refresh_at,
    last_live_refresh_ms: snapshot.last_live_refresh_ms,
    snapshot_reprocessed_at: snapshot.snapshot_reprocessed_at,
    snapshot_reprocessed_from_engine_version: snapshot.snapshot_reprocessed_from_engine_version,
    diagnostics: snapshot.diagnostics
  };
}

export default async req => {
  if (req.method === "OPTIONS") return response({}, 200, "preflight");
  try {
    const { snapshot, source } = await readCatalogV3Snapshot();
    if (snapshot && snapshot.diagnostics) return response(diagnosticPayload(snapshot), 200, source);
  } catch (error) {
    console.warn("Catalog V3 diagnostics blob read skipped:", error.message);
  }
  return response(diagnosticPayload(fallbackSnapshot), 200, "bundled-fallback");
};
