import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import fallbackPayload from "../data/catalog-fallback.json" with { type: "json" };
import snapshot from "../data/catalog-fallback-snapshot.json" with { type: "json" };
import { buildCatalog, normalizeOffer, discountPercentForVendor } from "../netlify/functions/_shared/catalog-engine.mjs";
import { refreshCatalog } from "../netlify/functions/_shared/catalog-refresh.mjs";

const rows = (fallbackPayload.products || []).map(row => ({ ...row, source_layer: "test-fallback" }));
const rebuilt = buildCatalog(rows);
assert.equal(rebuilt.silent_drop_count, 0, "Catalog engine must not silently drop offers");
assert.equal(rebuilt.normalized_offer_count + rebuilt.excluded_count, rows.length, "Every fallback row must normalize or be explicitly excluded");
assert.ok(rebuilt.products.length > 90, "Expected a broad comparison catalog");
// One card per compound. Formats are a dimension inside the card now, so BPC-157
// must appear exactly once and carry both its vial and capsule listings.
const bpc = rebuilt.products.filter(card => card.name === "BPC-157");
assert.equal(bpc.length, 1, "BPC-157 must resolve to a single merged card");
assert.ok(bpc[0].format_labels.includes("Vials"), "BPC-157 vial listings missing");
assert.ok(bpc[0].format_labels.includes("Capsules"), "BPC-157 capsule listings missing");
assert.ok(bpc[0].variants.some(v => v.format === "Vials") && bpc[0].variants.some(v => v.format === "Capsules"), "BPC-157 variants must span formats");
const ids = rebuilt.products.map(card => card.id);
assert.equal(new Set(ids).size, ids.length, "Product card ids must be unique");
const productIds = rebuilt.products.map(card => card.product_id);
assert.equal(new Set(productIds).size, productIds.length, "Each compound must produce exactly one card");
assert.equal(normalizeOffer({ company: "Bioedge Research Labs", product: "BPC-157 10mg", listing: "BPC-157 10mg", price: "$100.00" }).effective_price_label, "$85.00");
assert.equal(normalizeOffer({ company: "Ion Peptide", product: "BPC-157 10mg", listing: "BPC-157 10mg", price: "$100.00" }).effective_price_label, "$85.00");
// Ion Peptide is used here rather than a vendor that runs promotions: an active
// discount_override_percent legitimately changes the effective price, which
// would fail this assertion every time a sale is added or changed.
// Promotion-driven vendor overrides are time-windowed and rotate, so they are not asserted against fixed calendar dates. Standard per-vendor rates below still cover discountPercentForVendor.
assert.equal(discountPercentForVendor("Solyn Labs", "2026-06-10T12:00:00-04:00"), 10, "Solyn standard SAMMYC estimate should be 10 percent");
assert.equal(snapshot.schema_version, "catalog-v1", "Bundled snapshot schema mismatch");
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("offline test"); };
const offline = await refreshCatalog(null);
assert.ok(offline.products.length > 90, "Offline refresh should retain fallback cards");
assert.equal(offline.diagnostics.vendor_status["Glacier Aminos"].status, "fallback_static");
const previous = { raw_offers_by_vendor: { "Glow Aminos": [{ company: "Glow Aminos", product: "BPC-157 10mg", listing: "BPC-157 10mg", price: "$50.00" }] } };
const stale = await refreshCatalog(previous);
assert.equal(stale.diagnostics.vendor_status["Glow Aminos"].status, "stale_previous_snapshot", "Failed live feeds should retain prior vendor rows");
assert.ok(stale.products.some(card => card.name === "BPC-157"), "Stale vendor rows should remain represented");
globalThis.fetch = originalFetch;
console.log(`Catalog tests passed: ${rebuilt.product_card_count} cards, ${rebuilt.normalized_offer_count} offers, ${rebuilt.excluded_count} explicit exclusions`);

// Guard against the stacking bug: when a promo declares a sitewide
// sale_percent, the override must equal that sale compounded with the
// vendor's own code rate. Checking against vendor-config rather than parsed
// copy also catches compounding with the wrong base rate.
const promoFile = JSON.parse(await readFile(new URL("../data/promotions.json", import.meta.url), "utf8"));
const vendorFile = JSON.parse(await readFile(new URL("../data/vendor-config.json", import.meta.url), "utf8"));
const stackIssues = [];
for (const promo of promoFile.promotions || []) {
  const sitewide = Number(promo.sale_percent);
  const override = Number(promo.discount_override_percent);
  if (!Number.isFinite(sitewide) || !Number.isFinite(override)) continue;
  const base = Number(vendorFile.vendors?.[promo.vendor]?.discount_percent || 0);
  const expected = Number(((1 - (1 - sitewide / 100) * (1 - base / 100)) * 100).toFixed(2));
  if (Math.abs(override - expected) > 0.01) {
    stackIssues.push(`${promo.id}: ${sitewide}% sale compounded with ${promo.vendor}'s ${base}% code = ${expected}%, override is ${override}`);
  }
}
if (stackIssues.length) {
  console.error("\nStacked discount mismatch:");
  stackIssues.forEach(line => console.error(`  - ${line}`));
  process.exitCode = 1;
}
