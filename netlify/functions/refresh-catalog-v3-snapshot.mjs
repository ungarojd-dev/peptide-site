import { getStore } from "@netlify/blobs";
import { buildFreshCatalog } from "./_shared/catalog-v3-feeds.mjs";

const STORE_NAME = "mpp-catalog-v3";
const SNAPSHOT_KEY = "latest";
const SITE_ORIGIN = (process.env.URL || "https://mypeptideprice.com").replace(/\/+$/, "");

export default async () => {
  const store = getStore(STORE_NAME);
  let previousSnapshot = null;
  try {
    previousSnapshot = await store.get(SNAPSHOT_KEY, { type: "json" });
  } catch (error) {
    console.warn("Catalog V3 previous snapshot unavailable:", error.message);
  }

  const snapshot = await buildFreshCatalog({ origin: SITE_ORIGIN, previousSnapshot, timeoutMs: 14000 });
  if (!Array.isArray(snapshot.products) || !snapshot.products.length) {
    throw new Error("Catalog V3 refresh generated no cards");
  }

  await store.setJSON(SNAPSHOT_KEY, snapshot, {
    metadata: {
      updated_at: snapshot.snapshot_updated_at,
      cards: snapshot.product_card_count,
      offers: snapshot.normalized_offer_count,
      vendors: snapshot.vendors_loaded
    }
  });

  console.log(`Stored Catalog V3 snapshot: ${snapshot.product_card_count} cards, ${snapshot.normalized_offer_count} offers, ${snapshot.vendors_loaded} vendors in ${snapshot.snapshot_refresh_ms}ms`);
};
