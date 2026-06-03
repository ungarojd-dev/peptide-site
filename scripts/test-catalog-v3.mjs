import assert from "node:assert/strict";
import fallbackPayload from "../data/catalog-v3-fallback.json" with { type: "json" };
import snapshot from "../data/catalog-v3-fallback-snapshot.json" with { type: "json" };
import { buildCatalog, normalizeOffer } from "../netlify/functions/_shared/catalog-v3-engine.mjs";
import { buildFreshCatalog } from "../netlify/functions/_shared/catalog-v3-feeds.mjs";

const rows = (fallbackPayload.products || []).map(row => ({ ...row, source_layer: "test-fallback" }));
const rebuilt = buildCatalog(rows);
assert.equal(rebuilt.silent_drop_count, 0, "Catalog engine must not silently drop normalized offers");
assert.equal(rebuilt.normalized_offer_count, rows.length, "Every bundled fallback row should remain represented");
assert.ok(rebuilt.products.length > 90, "Expected a broad product catalog");
assert.ok(rebuilt.products.some(card => card.name === "BPC-157" && card.format === "Vials"), "BPC-157 vial card missing");
assert.ok(rebuilt.products.some(card => card.name === "BPC-157" && card.format === "Capsules"), "BPC-157 capsule card missing");
assert.ok(rebuilt.products.some(card => card.name === "Retatrutide + Cagrilintide Blend"), "GLP blend mapping missing");
assert.ok(rebuilt.products.some(card => card.name === "GHK-Cu + KPV Blend"), "Recovery blend mapping missing");
const southern = normalizeOffer({ company: "Southern Aminos", product: "BPC-157 10mg", listing: "BPC-157 10mg", price: "$100.00" });
assert.equal(southern.effective_price_label, "$85.00", "Southern Aminos SAMMYC calculation should be 15% off");
const oneday = normalizeOffer({ company: "Oneday Compounds", product: "BPC-157 10mg", listing: "BPC-157 10mg", price: "$100.00" });
assert.equal(oneday.effective_price_label, "$90.00", "Oneday Compounds SAMMYC calculation should be 10% off");
const blend = normalizeOffer({ company: "Glacier Aminos", product: "GLA-3 RT/CAGRI 20MG/4MG", listing: "Glacier GLA-3 RT CAGRI 20MG 4MG Peptide Vial", price: "$134.99" });
assert.equal(blend.product_name, "Retatrutide + Cagrilintide Blend", "Coded GLP blend should map to one canonical blend card");

const cleanupFixture = [
  { company: "Glow Aminos", product: "FG1-S", listing: "FG1-S - 10MG", price: "$50.00" },
  { company: "Glow Aminos", product: "FG2-T", listing: "FG2-T - 20MG", price: "$70.00" },
  { company: "Glow Aminos", product: "FG3-R", listing: "FG3-R - 30MG", price: "$90.00" },
  { company: "Glow Aminos", product: "FG3-R/FG2-T Blend", listing: "FG3-R/FG2-T Blend", price: "$110.00" },
  { company: "Instant Peptides", product: "5Amino-1MQ", listing: "5Amino-1MQ - 50mg", price: "$60.00" },
  { company: "Glacier Aminos", product: "METHYLINE BLUE CAPSULES 20MG", listing: "METHYLINE BLUE CAPSULES 20MG", price: "$40.00" },
  { company: "Southern Aminos", product: "Aegis Vial Covers", listing: "Aegis Vial Covers - Blue", price: "$10.00" },
  { company: "Southern Aminos", product: "Hospira SodiumBenzyl BAC Water - 30mL", listing: "Hospira SodiumBenzyl BAC Water - 30mL", price: "$12.00" },
  { company: "Oneday Compounds", product: "CJC + IPA (NO DAC) 10MG", listing: "CJC + IPA (NO DAC) 10MG", price: "$80.00" },
  { company: "Mile High Peptides", product: "Limited Edition 7x Tested 1st Anniversary Tee (Oversized)", listing: "Limited Edition 7x Tested 1st Anniversary Tee (Oversized) - White - Large", price: "$25.00" },
  { company: "Oneday Compounds", product: "Extended Product Protection", listing: "Extended Product Protection", price: "$5.00" }
].map(row => ({ ...row, source_layer: "cleanup-fixture" }));
const cleaned = buildCatalog(cleanupFixture);
assert.equal(cleaned.silent_drop_count, 0, "Cleanup classification must not silently drop rows");
assert.equal(cleaned.excluded_count, 2, "Merchandise and protection add-ons should be explicitly excluded");
assert.equal(cleaned.normalized_offer_count, cleanupFixture.length - 2, "Explicit exclusions should be the only removed rows");
assert.equal(cleaned.visible_unmapped_count, 0, "Reviewed live diagnostic fixture should map cleanly");
assert.ok(cleaned.products.some(card => card.name === "Semaglutide"), "FG1-S should map to Semaglutide");
assert.ok(cleaned.products.some(card => card.name === "Tirzepatide"), "FG2-T should map to Tirzepatide");
assert.ok(cleaned.products.some(card => card.name === "Retatrutide"), "FG3-R should map to Retatrutide");
assert.ok(cleaned.products.some(card => card.name === "Tirzepatide + Retatrutide Blend" || card.name === "Retatrutide + Tirzepatide Blend"), "FG3-R/FG2-T blend should remain one blended comparison card");
assert.ok(cleaned.products.some(card => card.name === "5-Amino-1MQ"), "5Amino-1MQ vendor spelling should map correctly");
assert.ok(cleaned.products.some(card => card.name === "Methylene Blue" && card.format === "Capsules"), "Methyline Blue typo should map to capsule format");
assert.ok(cleaned.products.some(card => card.name === "Vial Caps & Covers" && card.format === "Supplies"), "Vial cover supplies should map into the Supplies filter");
assert.ok(cleaned.products.some(card => card.name === "Bacteriostatic Water" && card.format === "Supplies"), "BAC water should map into the Supplies filter");
assert.ok(cleaned.products.some(card => card.name === "CJC-1295 + Ipamorelin Blend"), "CJC + IPA shorthand should map to the canonical blend card");
assert.equal(cleaned.diagnostics.excluded_products.length, 2, "Excluded product diagnostics should retain reviewable details");
assert.equal(snapshot.schema_version, "catalog-v3", "Static snapshot schema must remain Catalog V3");
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("offline test"); };
const offline = await buildFreshCatalog({ origin: "https://example.test", timeoutMs: 50 });
assert.equal(offline.silent_drop_count, 0, "Offline fallback should not silently drop rows");
assert.ok(offline.products.length > 90, "Offline build should retain bundled fallback cards");
assert.equal(offline.diagnostics.vendor_status["Glacier Aminos"].status, "fallback_static", "Glacier should fall back to static rows during an offline refresh");
const previous = { raw_offers_by_vendor: { "Ion Peptide": [{ company: "Ion Peptide", product: "BPC-157 10mg", listing: "BPC-157 10mg", price: "$50.00" }] } };
const stale = await buildFreshCatalog({ origin: "https://example.test", previousSnapshot: previous, timeoutMs: 50 });
assert.equal(stale.diagnostics.vendor_status["Ion Peptide"].status, "stale_previous_snapshot", "Failed live feeds should retain prior successful vendor rows");
globalThis.fetch = originalFetch;
console.log(`Catalog V3 tests passed: ${rebuilt.product_card_count} cards, ${rebuilt.normalized_offer_count} offers, ${rebuilt.visible_unmapped_count} visible unmapped rows`);
