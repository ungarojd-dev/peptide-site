// Builds data/catalog-fallback-snapshot.json from the live vendor APIs at deploy
// time, so the bundled snapshot and every generated static page ship with real
// product deep links and the full vendor roster.
//
// Replaces build-catalog-fallback.mjs in the Netlify build chain.
//
// Why: build-catalog-fallback.mjs rebuilds from data/catalog-fallback.json, a
// committed seed of 1506 rows carrying no `url` field and only 14 vendors. Any
// deploy running it reverted the bundled snapshot to base affiliate URLs and
// dropped Orbitrex, then regenerated all 100+ static pages from that. This
// script pulls the same live feeds the serverless functions use instead.
//
// Safety model, in order of preference:
//   1. Live pull succeeds with full vendor coverage  -> write new snapshot
//   2. Live pull is short on vendors or fails        -> keep committed snapshot,
//                                                        warn, exit 0
// The build never fails because a vendor feed had a bad minute. A stale but
// complete snapshot is always better than a fresh partial one baked into
// 100+ pages.
//
// Environment:
//   SKIP_CATALOG_LIVE=1        bypass entirely and use the committed snapshot
//   CATALOG_ALLOW_MISSING      comma-separated vendor names permitted to be absent
//   CATALOG_MIN_VENDORS        override the minimum vendor count (default: all
//                              configured vendors minus allowed-missing)

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildCatalog, publicSnapshot } from "../netlify/functions/_shared/catalog-engine.mjs";
import { VENDOR_ADAPTERS } from "../netlify/functions/_shared/vendor-adapters.mjs";

const W = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = `${W}/data/catalog-fallback-snapshot.json`;

const allowMissing = new Set(
  String(process.env.CATALOG_ALLOW_MISSING || "")
    .split(",").map(s => s.trim()).filter(Boolean)
);

function keepCommitted(reason) {
  console.warn(`\n  build-catalog-live: ${reason}`);
  console.warn("  Keeping the committed snapshot. Static pages will use the");
  console.warn("  last known-good data rather than partial live data.\n");
}

async function committedSummary() {
  try {
    const snap = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
    return `${snap.vendors_loaded ?? "?"} vendors, ${(snap.products || []).length} products, generated ${snap.generated_at || "unknown"}`;
  } catch {
    return "unreadable";
  }
}

if (process.env.SKIP_CATALOG_LIVE === "1") {
  keepCommitted("SKIP_CATALOG_LIVE=1 set, skipping the live pull");
  console.log(`  Committed snapshot: ${await committedSummary()}`);
  process.exit(0);
}

const configured = VENDOR_ADAPTERS.map(a => a.vendor);
const minVendors = Number.parseInt(process.env.CATALOG_MIN_VENDORS || "", 10)
  || (configured.length - allowMissing.size);

console.log(`build-catalog-live: pulling ${configured.length} vendor feeds`);

// Promise.allSettled, never a sequential loop: one slow vendor must not
// serialize the whole build.
const settled = await Promise.allSettled(VENDOR_ADAPTERS.map(a => a.load()));

const rows = [];
const vendorStatus = {};
const warnings = [];
const loaded = [];
const failed = [];

settled.forEach((result, index) => {
  const vendor = configured[index];
  if (result.status === "fulfilled" && result.value?.products?.length) {
    const tagged = result.value.products.map(row => ({ ...row, source_layer: "live-api" }));
    rows.push(...tagged);
    vendorStatus[vendor] = {
      status: "live",
      row_count: tagged.length,
      fetched_at: result.value.fetched_at || new Date().toISOString(),
      metadata: result.value.metadata || {}
    };
    loaded.push(vendor);
  } else {
    const message = result.status === "rejected"
      ? (result.reason?.message || String(result.reason))
      : "returned zero rows";
    vendorStatus[vendor] = { status: "failed", row_count: 0, error: message };
    warnings.push(`${vendor}: ${message}`);
    failed.push(vendor);
  }
});

console.log(`  loaded ${loaded.length}/${configured.length} vendors, ${rows.length} rows`);
for (const w of warnings) console.log(`  warning: ${w}`);

const missingBlocking = failed.filter(v => !allowMissing.has(v));

if (!rows.length) {
  keepCommitted("every vendor feed failed, no rows returned");
  console.log(`  Committed snapshot: ${await committedSummary()}`);
  process.exit(0);
}

if (loaded.length < minVendors) {
  keepCommitted(`only ${loaded.length} of ${configured.length} vendors loaded, minimum is ${minVendors}`);
  if (missingBlocking.length) console.warn(`  missing: ${missingBlocking.join(", ")}`);
  console.log(`  Committed snapshot: ${await committedSummary()}`);
  process.exit(0);
}

const catalog = buildCatalog(rows, { vendor_status: vendorStatus, warnings });
const output = {
  ...publicSnapshot(catalog),
  snapshot_updated_at: new Date().toISOString(),
  snapshot_refresh_ms: 0
};

// Deep-link rate is reported, not enforced. Solyn and Oneday are intentionally
// held on base URLs, so a non-zero base count is expected and must not block a
// deploy. A sudden drop to zero deep links is worth noticing in the build log.
let deep = 0;
let base = 0;
for (const product of output.products || []) {
  for (const variant of product.variants || []) {
    for (const supplier of variant.suppliers || []) {
      const url = String(supplier.affiliate_url || "");
      let path = "";
      try { path = new URL(url).pathname.replace(/\/+$/, "").replace(/^\//, ""); } catch { /* ignore */ }
      if (path && !["shop", "store", "products"].includes(path)) deep += 1;
      else base += 1;
    }
  }
}
const total = deep + base;
const pct = total ? Math.round((deep / total) * 100) : 0;

await writeFile(SNAPSHOT_PATH, `${JSON.stringify(output, null, 2)}\n`);

console.log(`  wrote data/catalog-fallback-snapshot.json`);
console.log(`  ${output.product_card_count} cards, ${output.normalized_offer_count} offers, ${loaded.length} vendors`);
console.log(`  deep links: ${deep}/${total} (${pct}%), base URLs: ${base}`);
if (deep === 0) console.warn("  warning: zero deep links resolved, check use_product_deep_links flags");
if (allowMissing.size) console.log(`  waived: ${[...allowMissing].join(", ")}`);
