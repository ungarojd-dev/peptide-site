import { randomUUID } from "node:crypto";
import { refreshCatalog } from "./_shared/catalog-refresh.mjs";
import { readRawSnapshot, readRefreshStatus, writeRefreshStatus, writeSnapshots } from "./_shared/catalog-store.mjs";

function compact(value) {
  return value == null ? "" : String(value).trim();
}

function authorized(request) {
  const expected = compact(process.env.CATALOG_REFRESH_TOKEN);
  if (!expected) return false;
  const bearer = compact(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  return bearer === expected || request.headers.get("x-catalog-refresh-token") === expected;
}

async function requestPayload(request) {
  try { return await request.json(); } catch { return {}; }
}

export default async request => {
  const payload = await requestPayload(request);
  const refreshId = compact(payload.refresh_id) || randomUUID();
  const requestedAt = compact(payload.requested_at) || new Date().toISOString();
  const requestedBy = compact(payload.requested_by) || "direct-background-invocation";

  if (request.method !== "POST" || !authorized(request)) {
    console.warn(request.method !== "POST" ? "Ignored non-POST background refresh invocation" : "Ignored unauthorized background refresh invocation");
    return;
  }

  let currentStatus = null;
  try { currentStatus = await readRefreshStatus(); } catch {}
  const currentUpdatedAt = Date.parse(currentStatus?.status_updated_at || "");
  const currentIsRecent = Number.isFinite(currentUpdatedAt) && Date.now() - currentUpdatedAt < 16 * 60 * 1000;
  if (currentIsRecent && ["queued", "running"].includes(currentStatus?.state) && currentStatus?.refresh_id && currentStatus.refresh_id !== refreshId) {
    console.log(`Skipped superseded background catalog refresh ${refreshId}; active refresh is ${currentStatus.refresh_id}`);
    return;
  }

  const startedAt = new Date().toISOString();
  await writeRefreshStatus({
    state: "running",
    refresh_id: refreshId,
    requested_at: requestedAt,
    requested_by: requestedBy,
    started_at: startedAt,
    message: "Catalog refresh is running in the background"
  });

  let previous = null;
  try { previous = await readRawSnapshot(); } catch (error) { console.warn("Previous catalog snapshot unavailable:", error.message); }

  try {
    const snapshot = await refreshCatalog(previous);
    if (!snapshot.products?.length) throw new Error("Catalog refresh generated no product cards");
    await writeSnapshots(snapshot);
    await writeRefreshStatus({
      state: "complete",
      refresh_id: refreshId,
      requested_at: requestedAt,
      requested_by: requestedBy,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      snapshot_updated_at: snapshot.snapshot_updated_at,
      snapshot_refresh_ms: snapshot.snapshot_refresh_ms,
      product_card_count: snapshot.product_card_count,
      normalized_offer_count: snapshot.normalized_offer_count,
      vendors_loaded: snapshot.vendors_loaded,
      warnings: snapshot.diagnostics?.warnings || [],
      message: "Catalog refresh completed successfully"
    });
    console.log(`Stored background catalog snapshot: ${snapshot.product_card_count} cards, ${snapshot.normalized_offer_count} offers, ${snapshot.vendors_loaded} vendors in ${snapshot.snapshot_refresh_ms}ms`);
  } catch (error) {
    await writeRefreshStatus({
      state: "error",
      refresh_id: refreshId,
      requested_at: requestedAt,
      requested_by: requestedBy,
      started_at: startedAt,
      failed_at: new Date().toISOString(),
      error: error.message || String(error),
      message: "Catalog refresh failed. The previous successful snapshot remains active."
    });
    console.error("Background catalog refresh failed:", error);
    throw error;
  }
};

export const config = {
  background: true,
  path: "/.netlify/functions/catalog-refresh-background"
};
