// OFFLINE ENGINE TEST ONLY. Rebuilds data/catalog-fallback-snapshot.json from
// data/catalog-fallback.json, a committed seed of 1506 rows with NO product url
// field and only 14 vendors. Running this overwrites the live snapshot and
// reverts every generated static page to base affiliate URLs.
//
// The deploy chain uses scripts/build-catalog-live.mjs instead. Only run this
// when you specifically want to exercise the engine against the fixed seed:
//   npm run build:fallback:seed

import { writeFile } from "node:fs/promises";
import fallbackPayload from "../data/catalog-fallback.json" with { type: "json" };
import { buildCatalog, publicSnapshot } from "../netlify/functions/_shared/catalog-engine.mjs";

const rows = (fallbackPayload.products || []).map(row => ({ ...row, source_layer: "fallback-static" }));
const catalog = buildCatalog(rows, {
  vendor_status: Object.fromEntries([...new Set(rows.map(row => row.company || "Unknown vendor"))].map(vendor => [vendor, { status: "fallback_static", row_count: rows.filter(row => row.company === vendor).length }]))
});
const output = { ...publicSnapshot(catalog), snapshot_updated_at: new Date().toISOString(), snapshot_refresh_ms: 0 };
await writeFile(new URL("../data/catalog-fallback-snapshot.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Built fallback: ${rows.length} raw rows, ${output.normalized_offer_count} offers, ${output.excluded_count} explicit exclusions, ${output.product_card_count} cards`);
