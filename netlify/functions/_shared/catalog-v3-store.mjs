import { getStore } from "@netlify/blobs";
import { ENGINE_VERSION } from "./catalog-v3-engine.mjs";
import { reprocessStoredSnapshot, snapshotNeedsReprocessing } from "./catalog-v3-reprocess.mjs";

export const CATALOG_V3_STORE_NAME = "mpp-catalog-v3";
export const CATALOG_V3_SNAPSHOT_KEY = "latest";

export function getCatalogV3Store() {
  return getStore(CATALOG_V3_STORE_NAME);
}

export async function readCatalogV3Snapshot({ reprocess = true } = {}) {
  const store = getCatalogV3Store();
  let snapshot = await store.get(CATALOG_V3_SNAPSHOT_KEY, { type: "json" });
  let source = "blob";
  if (snapshot && reprocess && snapshotNeedsReprocessing(snapshot)) {
    const rebuilt = reprocessStoredSnapshot(snapshot);
    if (rebuilt) {
      await writeCatalogV3Snapshot(rebuilt, store);
      snapshot = rebuilt;
      source = "blob-reprocessed";
    }
  }
  return { snapshot, source };
}

export async function writeCatalogV3Snapshot(snapshot, store = getCatalogV3Store()) {
  await store.setJSON(CATALOG_V3_SNAPSHOT_KEY, snapshot, {
    metadata: {
      updated_at: snapshot.snapshot_updated_at,
      last_live_refresh_at: snapshot.last_live_refresh_at || snapshot.snapshot_updated_at,
      engine_version: snapshot.engine_version || ENGINE_VERSION,
      cards: snapshot.product_card_count,
      offers: snapshot.normalized_offer_count,
      vendors: snapshot.vendors_loaded
    }
  });
  return snapshot;
}
