import { getStore } from "@netlify/blobs";

const STORE_NAME = "mpp-product-snapshots";
const SNAPSHOT_KEY = "latest-v3";

function response(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "https://mypeptideprice.com",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export default async (req) => {
  if (req.method === "OPTIONS") return response({}, 200);

  try {
    const store = getStore(STORE_NAME);
    const snapshot = await store.get(SNAPSHOT_KEY, { type: "json" });
    if (!snapshot || !Array.isArray(snapshot.products)) {
      return response({ error: "No ingestion-v3 snapshot has been seeded yet" }, 404);
    }

    return response({
      schema_version: snapshot.schema_version || "unknown",
      snapshot_updated_at: snapshot.snapshot_updated_at || null,
      snapshot_refresh_ms: snapshot.snapshot_refresh_ms || null,
      product_count: snapshot.products.length,
      upstream_errors: snapshot.errors || [],
      diagnostics: snapshot.diagnostics || {}
    });
  } catch (error) {
    return response({ error: error.message }, 500);
  }
};
