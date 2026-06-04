import { refreshCatalog } from "./_shared/catalog-refresh.mjs";
import { readRawSnapshot, writeSnapshots } from "./_shared/catalog-store.mjs";

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

function authorized(request) {
  const expected = process.env.CATALOG_REFRESH_TOKEN;
  if (!expected) return false;
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return bearer === expected || request.headers.get("x-catalog-refresh-token") === expected;
}

export default async request => {
  if (request.method !== "POST") return reply({ error: "Use POST" }, 405);
  if (!authorized(request)) return reply({ error: "Unauthorized" }, 401);
  let previous = null;
  try { previous = await readRawSnapshot(); } catch {}
  try {
    const snapshot = await refreshCatalog(previous);
    if (!snapshot.products?.length) throw new Error("Catalog refresh generated no product cards");
    await writeSnapshots(snapshot);
    return reply({ ok: true, snapshot_updated_at: snapshot.snapshot_updated_at, snapshot_refresh_ms: snapshot.snapshot_refresh_ms, product_card_count: snapshot.product_card_count, normalized_offer_count: snapshot.normalized_offer_count, vendors_loaded: snapshot.vendors_loaded, warnings: snapshot.diagnostics?.warnings || [] });
  } catch (error) {
    return reply({ error: error.message }, 500);
  }
};
