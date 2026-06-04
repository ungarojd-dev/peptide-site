import { refreshCatalog } from "./_shared/catalog-refresh.mjs";
import { readRawSnapshot, writeSnapshots } from "./_shared/catalog-store.mjs";

export default async () => {
  let previous = null;
  try { previous = await readRawSnapshot(); } catch (error) { console.warn("Previous catalog snapshot unavailable:", error.message); }
  const snapshot = await refreshCatalog(previous);
  if (!snapshot.products?.length) throw new Error("Catalog refresh generated no product cards");
  await writeSnapshots(snapshot);
  console.log(`Stored catalog snapshot: ${snapshot.product_card_count} cards, ${snapshot.normalized_offer_count} offers, ${snapshot.vendors_loaded} vendors in ${snapshot.snapshot_refresh_ms}ms`);
};
