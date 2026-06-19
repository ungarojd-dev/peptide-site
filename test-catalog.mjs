import { getStore } from "@netlify/blobs";
import { buildCatalog, publicSnapshot } from "./catalog-engine.mjs";

const STORE_NAME = "mpp-catalog";
const RAW_KEY = "raw-latest";
const PUBLIC_KEY = "public-latest";
const REFRESH_STATUS_KEY = "refresh-status";

function store() {
  return getStore(STORE_NAME);
}

export async function readRawSnapshot() {
  return await store().get(RAW_KEY, { type: "json" });
}

export async function readPublicSnapshot() {
  const catalogStore = store();
  const cached = await catalogStore.get(PUBLIC_KEY, { type: "json" });
  if (cached?.products?.length) return cached;
  const raw = await catalogStore.get(RAW_KEY, { type: "json" });
  if (!raw?.raw_offers_by_vendor) return null;
  const rebuilt = {
    ...buildCatalog(Object.values(raw.raw_offers_by_vendor).flat(), {
      vendor_status: raw.diagnostics?.vendor_status || {},
      warnings: raw.diagnostics?.warnings || []
    }),
    snapshot_updated_at: raw.snapshot_updated_at || new Date().toISOString(),
    snapshot_refresh_ms: raw.snapshot_refresh_ms || 0,
    last_live_refresh_at: raw.last_live_refresh_at || raw.snapshot_updated_at || ""
  };
  const publicData = publicSnapshot(rebuilt);
  await catalogStore.setJSON(PUBLIC_KEY, publicData);
  return publicData;
}

export async function readRefreshStatus() {
  return await store().get(REFRESH_STATUS_KEY, { type: "json" });
}

export async function writeRefreshStatus(status = {}) {
  const payload = {
    ...status,
    status_updated_at: new Date().toISOString()
  };
  await store().setJSON(REFRESH_STATUS_KEY, payload, {
    metadata: {
      state: payload.state || "unknown",
      refresh_id: payload.refresh_id || "",
      updated_at: payload.status_updated_at
    }
  });
  return payload;
}

export async function writeSnapshots(rawSnapshot) {
  const catalogStore = store();
  const publicData = publicSnapshot(rawSnapshot);
  await Promise.all([
    catalogStore.setJSON(RAW_KEY, rawSnapshot, { metadata: { updated_at: rawSnapshot.snapshot_updated_at, cards: rawSnapshot.product_card_count, offers: rawSnapshot.normalized_offer_count, vendors: rawSnapshot.vendors_loaded } }),
    catalogStore.setJSON(PUBLIC_KEY, publicData, { metadata: { updated_at: rawSnapshot.snapshot_updated_at, cards: rawSnapshot.product_card_count, offers: rawSnapshot.normalized_offer_count, vendors: rawSnapshot.vendors_loaded } })
  ]);
  return publicData;
}
