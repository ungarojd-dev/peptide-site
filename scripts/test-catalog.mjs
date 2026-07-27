import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const promoFilePre = JSON.parse(await readFile(new URL("../data/promotions.json", import.meta.url), "utf8"));
const vendorFilePre = JSON.parse(await readFile(new URL("../data/vendor-config.json", import.meta.url), "utf8"));
const catalogUiSource = await readFile(new URL("../assets/catalog-ui.js", import.meta.url), "utf8");
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
const saleFeedOffer = normalizeOffer({
  company: "Glow Aminos",
  product: "BPC-157 10mg",
  listing: "BPC-157 10mg",
  price: "$100.00",
  sale_price: "$60.00"
});
assert.equal(saleFeedOffer.regular_price_label, "$60.00", "The vendor feed sale price should be the catalog starting price");
assert.equal(saleFeedOffer.effective_price_label, "$51.00", "Only Glow's standing 15 percent SAMMYC rate should be applied to the feed price");
assert.equal(saleFeedOffer.discount_percent, 15, "A promotion must not replace the standing SAMMYC rate");
assert.equal(discountPercentForVendor("Solyn Labs", "2026-06-10T12:00:00-04:00"), 10, "Solyn standard SAMMYC estimate should be 10 percent");
const expectedSammycRates = {
  "Glacier Aminos": 10,
  "Mile High Peptides": 10,
  "LabSourced Peptides": 15,
  "Instant Peptides": 15,
  "Southern Aminos": 15,
  "Flawless Compounds": 15,
  "Glow Aminos": 15,
  "Solyn Labs": 10,
  "Oneday Compounds": 10,
  "Ion Peptide": 15,
  "Coffee and Peppers": 15,
  "Bioedge Research Labs": 15,
  "High Tide Compounds": 10,
  "Disguised Alpha": 10
};
for (const [vendor, expectedRate] of Object.entries(expectedSammycRates)) {
  assert.equal(
    Number(vendorFilePre.vendors?.[vendor]?.discount_percent),
    expectedRate,
    `${vendor}: standing SAMMYC rate must remain ${expectedRate}%`
  );
}
// Row labels intentionally show the sale and code split ("40% off + 15% with
// SAMMYC") read from promotions.json, using .supplier-discount-plus. The sale
// price is already in the vendor feed, so this is display only and does not
// change price math.
assert.match(catalogUiSource, /supplier-discount-plus/, "Stacked discount label should render sale + code split");
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

// Promotion metadata is disclosure-only. Every promo override must leave the
// calculated price at the standing vendor-config SAMMYC rate.
for (const promo of promoFilePre.promotions || []) {
  if (!Number.isFinite(Number(promo.discount_override_percent))) continue;
  const base = Number(vendorFilePre.vendors?.[promo.vendor]?.discount_percent || 0);
  const during = new Date(promo.start_at || Date.now());
  const category = promo.scope_categories?.[0] || null;
  assert.equal(
    discountPercentForVendor(promo.vendor, during, category),
    base,
    `${promo.id}: promotion metadata must not alter the ${base}% standing SAMMYC rate`
  );
}
