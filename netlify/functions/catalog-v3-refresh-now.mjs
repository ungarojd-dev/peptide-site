import { buildFreshCatalog } from "./_shared/catalog-v3-feeds.mjs";
import { readCatalogV3Snapshot, writeCatalogV3Snapshot } from "./_shared/catalog-v3-store.mjs";

const SITE_ORIGIN = (process.env.URL || "https://mypeptideprice.com").replace(/\/+$/, "");
const MIN_REFRESH_INTERVAL_MS = 30000;

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": SITE_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export default async req => {
  if (req.method === "OPTIONS") return response({}, 200);
  if (req.method !== "POST") return response({ error: "Use POST to refresh Catalog V3" }, 405);

  let previousSnapshot = null;
  try {
    previousSnapshot = (await readCatalogV3Snapshot({ reprocess: false })).snapshot;
  } catch {}

  const previousTime = Date.parse(previousSnapshot?.last_live_refresh_at || previousSnapshot?.snapshot_updated_at || "");
  if (Number.isFinite(previousTime) && Date.now() - previousTime < MIN_REFRESH_INTERVAL_MS) {
    return response({
      error: "Catalog V3 was refreshed recently. Wait briefly before running another live refresh.",
      retry_after_seconds: Math.ceil((MIN_REFRESH_INTERVAL_MS - (Date.now() - previousTime)) / 1000)
    }, 429);
  }

  try {
    const snapshot = await buildFreshCatalog({ origin: SITE_ORIGIN, previousSnapshot, timeoutMs: 14000 });
    if (!Array.isArray(snapshot.products) || !snapshot.products.length) throw new Error("Catalog V3 refresh generated no cards");
    await writeCatalogV3Snapshot(snapshot);
    return response({
      ok: true,
      engine_version: snapshot.engine_version,
      snapshot_updated_at: snapshot.snapshot_updated_at,
      snapshot_refresh_ms: snapshot.snapshot_refresh_ms,
      product_card_count: snapshot.product_card_count,
      normalized_offer_count: snapshot.normalized_offer_count,
      visible_unmapped_count: snapshot.visible_unmapped_count,
      excluded_count: snapshot.excluded_count,
      warnings: snapshot.diagnostics?.warnings || []
    });
  } catch (error) {
    return response({ error: error.message }, 500);
  }
};
