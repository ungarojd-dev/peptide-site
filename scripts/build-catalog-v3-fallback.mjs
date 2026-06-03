import { writeFile } from "node:fs/promises";
import fallbackPayload from "../data/catalog-v3-fallback.json" with { type: "json" };
import { buildCatalog, publicSnapshot } from "../netlify/functions/_shared/catalog-v3-engine.mjs";

const rows = (fallbackPayload.products || []).map(row => ({ ...row, source_layer: "fallback-static" }));
const snapshot = buildCatalog(rows, {
  vendor_status: Object.fromEntries([...new Set(rows.map(row => row.company || "Unknown vendor"))].map(vendor => [vendor, {
    status: "fallback_static",
    row_count: rows.filter(row => (row.company || "Unknown vendor") === vendor).length
  }]))
});
const output = {
  ...publicSnapshot(snapshot),
  snapshot_updated_at: new Date().toISOString(),
  snapshot_refresh_ms: 0
};
await writeFile(new URL("../data/catalog-v3-fallback-snapshot.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Built Catalog V3 fallback snapshot: ${output.product_card_count} cards, ${output.normalized_offer_count} offers, ${output.vendors_loaded} vendors, ${output.visible_unmapped_count} visible unmapped`);
