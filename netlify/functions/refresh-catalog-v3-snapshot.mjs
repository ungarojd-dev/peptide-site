import { buildFreshCatalog } from "./_shared/catalog-v3-feeds.mjs";
import { readCatalogV3Snapshot, writeCatalogV3Snapshot } from "./_shared/catalog-v3-store.mjs";

const SITE_ORIGIN = (process.env.URL || "https://mypeptideprice.com").replace(/\/+$/, "");

export default async () => {
  let previousSnapshot = null;
  try {
    previousSnapshot = (await readCatalogV3Snapshot()).snapshot;
  } catch (error) {
    console.warn("Catalog V3 previous snapshot unavailable:", error.message);
  }

  const snapshot = await buildFreshCatalog({ origin: SITE_ORIGIN, previousSnapshot, timeoutMs: 14000 });
  if (!Array.isArray(snapshot.products) || !snapshot.products.length) {
    throw new Error("Catalog V3 refresh generated no cards");
  }

  await writeCatalogV3Snapshot(snapshot);
  console.log(`Stored Catalog V3 snapshot: ${snapshot.product_card_count} cards, ${snapshot.normalized_offer_count} offers, ${snapshot.vendors_loaded} vendors in ${snapshot.snapshot_refresh_ms}ms`);
};
