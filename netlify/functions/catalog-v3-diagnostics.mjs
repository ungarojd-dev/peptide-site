import { getStore } from "@netlify/blobs";
import fallbackSnapshot from "../../data/catalog-v3-fallback-snapshot.json" with { type: "json" };

const STORE_NAME = "mpp-catalog-v3";
const SNAPSHOT_KEY = "latest";

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

export default async req => {
  if (req.method === "OPTIONS") return response({}, 200, "preflight");
  try {
    const store = getStore(STORE_NAME);
    const snapshot = await store.get(SNAPSHOT_KEY, { type: "json" });
    if (snapshot && snapshot.diagnostics) {
      return response({
        schema_version: snapshot.schema_version,
        engine_version: snapshot.engine_version,
        snapshot_updated_at: snapshot.snapshot_updated_at,
        snapshot_refresh_ms: snapshot.snapshot_refresh_ms,
        diagnostics: snapshot.diagnostics
      }, 200, "blob");
    }
  } catch (error) {
    console.warn("Catalog V3 diagnostics blob read skipped:", error.message);
  }
  return response({
    schema_version: fallbackSnapshot.schema_version,
    engine_version: fallbackSnapshot.engine_version,
    snapshot_updated_at: fallbackSnapshot.snapshot_updated_at,
    snapshot_refresh_ms: fallbackSnapshot.snapshot_refresh_ms,
    diagnostics: fallbackSnapshot.diagnostics
  }, 200, "bundled-fallback");
};
