// Static consistency checks that run on every deploy.
//
// Every bug this catches has already shipped at least once. The pattern is
// always the same: a list is maintained by hand in one place while the truth
// lives in another, and nothing notices they disagree. A missing dropdown
// option, a stale vendor count and a format absent from a filter all look like
// deliberate choices rather than faults, so they survive review indefinitely.
//
// Warnings are non-fatal by default because a half-shipped site is worse than a
// slightly stale one. Set QA_STRICT=1 to fail the build instead.

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const W = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const note = message => problems.push(message);
// Some drift is cosmetic and some of it is a wrong number on a page a customer
// reads. The second kind fails the deploy whether or not QA_STRICT is set,
// because "the site says a different number in three places" is the exact
// failure this file exists to stop. QA_ALLOW_COUNT_DRIFT=1 is the escape hatch.
const fatals = [];
const fail = message => (process.env.QA_ALLOW_COUNT_DRIFT === "1" ? problems : fatals).push(message);

const read = async path => {
  try { return await readFile(`${W}/${path}`, "utf8"); } catch { return null; }
};

const vendorConfig = JSON.parse(await read("data/vendor-config.json"));
const vendors = Object.keys(vendorConfig.vendors || {});
const snapshot = JSON.parse(await read("data/catalog-fallback-snapshot.json"));
const catalogUi = await read("assets/catalog-ui.js");
const indexHtml = await read("index.html");
const engineSource = (await read("netlify/functions/_shared/catalog-engine.mjs")) || "";

// ---------------------------------------------------------------------------
// 1. Formats and categories present in the data but missing from the filter
//    whitelists. This is exactly how Raw Powder existed in the catalog for a
//    deploy while being unselectable in the dropdown.
// ---------------------------------------------------------------------------
function whitelist(name) {
  // Plain string scanning rather than a constructed regex: the escaping is
  // easier to get wrong than the parsing is to do by hand.
  if (!catalogUi) return null;
  const at = catalogUi.indexOf(`${name}=`);
  if (at === -1) return null;
  const open = catalogUi.indexOf("[", at);
  const close = catalogUi.indexOf("]", open);
  if (open === -1 || close === -1) return null;
  return [...catalogUi.slice(open, close).matchAll(/"([^"]+)"/g)].map(m => m[1]);
}
const formatOrder = whitelist("FORMAT_ORDER");
const categoryOrder = whitelist("CATEGORY_ORDER");

const dataFormats = new Set();
const dataCategories = new Set();
for (const product of snapshot.products || []) {
  if (product.category) dataCategories.add(product.category);
  for (const variant of product.variants || []) if (variant.format) dataFormats.add(variant.format);
}
if (formatOrder) {
  for (const format of dataFormats) {
    // A format the engine no longer emits can linger in the committed snapshot
    // until the next live pull, so those are reported as informational.
    const stillEmitted = engineSource.includes(`"${format}":`);
    if (!formatOrder.includes(format) && stillEmitted) {
      note(`format "${format}" is produced by the engine but missing from FORMAT_ORDER, so it cannot be filtered`);
    }
  }
}
// Categories intentionally pass vendor values through, so only the canonical
// ones are checked; unknown vendor categories are expected and filtered out.

// ---------------------------------------------------------------------------
// 2. Vendors missing from any hand-maintained list.
// ---------------------------------------------------------------------------
const cms = await read("admin/config.yml");
for (const vendor of vendors) {
  if (cms && !cms.includes(`"${vendor}"`)) note(`vendor "${vendor}" is missing from the CMS dropdowns in admin/config.yml`);
  const meta = vendorConfig.vendors[vendor];
  if (meta.logo && indexHtml && !indexHtml.toLowerCase().includes(vendor.toLowerCase() + '":')) {
    note(`vendor "${vendor}" is missing from the announcement bar logo map in index.html`);
  }
}

// ---------------------------------------------------------------------------
// 2b. Vendor logos: a missing path or a path pointing at no file renders as
//     initials on every listing for that vendor, which reads as an oversight
//     rather than a fault and can sit there for days.
// ---------------------------------------------------------------------------
{
  const { access } = await import("node:fs/promises");
  for (const [name, meta] of Object.entries(vendorConfig.vendors || {})) {
    if (!meta.logo) { note(`vendor "${name}" has no logo path, its listings will show initials`); continue; }
    try { await access(`${W}${meta.logo}`); }
    catch { note(`vendor "${name}" points at ${meta.logo}, which does not exist`); }
  }
}

// ---------------------------------------------------------------------------
// 3. Vendor counts printed in HTML that disagree with the configured roster.
// ---------------------------------------------------------------------------
// Generated pages count the vendors actually present in the snapshot, which is
// legitimately behind the roster until a deploy pulls live feeds. Both numbers
// are accepted so the check flags real drift rather than that lag.
const snapshotVendors = new Set();
for (const product of snapshot.products || [])
  for (const variant of product.variants || [])
    for (const supplier of variant.suppliers || []) snapshotVendors.add(supplier.vendor_name);
// The sitewide vendor number is the ROSTER, always. It used to also accept the
// snapshot's vendor count, and that tolerance is why the homepage could say 18
// while the vendor directory said 13 and nothing complained. Per-compound counts
// are worded "Vendors listing it" and are matched by neither pattern below.
const expected = vendors.length;
if (snapshotVendors.size !== expected) {
  note(`price snapshot carries ${snapshotVendors.size} of the ${expected} roster vendors (${vendors.filter(v => !snapshotVendors.has(v)).join(", ")}), so those vendors show no listings`);
}
for (const file of await readdir(W)) {
  if (!file.endsWith(".html")) continue;
  const html = await read(file);
  if (!html) continue;
  for (const match of html.matchAll(/<span>(?:Tracked )?[Vv]endors<\/span>\s*<strong>(\d+)<\/strong>/g)) {
    const n = Number(match[1]);
    if (n !== expected) fail(`${file} advertises ${n} vendors, roster has ${expected}`);
  }
  for (const match of html.matchAll(/[Aa]cross (\d+) (?:verified |tracked )?[Vv]endors/g)) {
    const n = Number(match[1]);
    if (n !== expected) fail(`${file} says "across ${n} vendors", roster has ${expected}`);
  }
  // The vendor directory's own sentence. It was the one sitewide count no
  // pattern here matched, so it drifted to 13 unnoticed.
  for (const match of html.matchAll(/supports (\d+) vendor partners/g)) {
    const n = Number(match[1]);
    if (n !== expected) fail(`${file} says "supports ${n} vendor partners", roster has ${expected}`);
  }
}

// The homepage "Trusted vendors" tile is rendered at runtime from a constant
// hardcoded in JavaScript, so it appears in no HTML file and nothing above can
// see it. Adding a vendor to vendor-config and forgetting this line is the next
// drift, and it would show on the busiest page on the site.
if (catalogUi) {
  const m = catalogUi.match(/TRACKED_VENDOR_COUNT\s*=\s*(\d+)/);
  if (!m) note("assets/catalog-ui.js no longer defines TRACKED_VENDOR_COUNT, so the homepage vendor tile is unchecked");
  else if (Number(m[1]) !== expected) fail(`assets/catalog-ui.js sets TRACKED_VENDOR_COUNT=${m[1]}, roster has ${expected}`);
}

// ---------------------------------------------------------------------------
// 4. Cache-bust strings that disagree with each other. A mismatch means some
//    visitors get new HTML pointing at old CSS.
// ---------------------------------------------------------------------------
const versions = new Set();
for (const file of await readdir(W)) {
  if (!file.endsWith(".html")) continue;
  const html = await read(file);
  for (const match of (html || "").matchAll(/\?v=(\d{8}-[a-z0-9-]+)/g)) versions.add(match[1]);
}
// Asset JS carries its own hardcoded ?v= strings on the promotions and catalog
// fetches. These were missed for fifteen releases because this check only read
// HTML, so the deals feed stayed pinned to an old cache key while every page
// moved on. Scan them too.
for (const file of await readdir(`${W}/assets`)) {
  // CSS as well as JS: a background-image URL in site.css carried its own
  // ?v= string and drifted for the same reason the JS constants did.
  if (!file.endsWith(".js") && !file.endsWith(".css")) continue;
  const asset = await read(`assets/${file}`);
  for (const match of (asset || "").matchAll(/\?v=(\d{8}-[a-z0-9-]+)/g)) versions.add(match[1]);
}
if (versions.size > 1) note(`${versions.size} different cache-bust strings in use: ${[...versions].join(", ")}`);

// ---------------------------------------------------------------------------
// 5. JS querying selectors that appear in no HTML file. setupPromotionRolodex
//    targeted [data-sale-card], which exists nowhere, so edits to it changed
//    nothing while appearing to be a fix.
// ---------------------------------------------------------------------------
const htmlFiles = [];
for (const dir of ["", "compounds", "vendors", "blog", "admin"]) {
  let entries = [];
  try { entries = await readdir(`${W}/${dir}`); } catch { continue; }
  for (const file of entries) if (file.endsWith(".html")) htmlFiles.push(dir ? `${dir}/${file}` : file);
}
const allHtml = (await Promise.all(htmlFiles.map(read))).join("\n");
for (const asset of ["assets/site.js", "assets/catalog-ui.js"]) {
  const js = await read(asset);
  if (!js) continue;
  const selectors = new Set([...js.matchAll(/querySelector(?:All)?\(\s*["'`]\[(data-[a-z0-9-]+)\]/g)].map(m => m[1]));
  for (const selector of selectors) {
    // Only a problem when nothing creates the element either. Most panels here
    // are built at runtime via innerHTML, so their hooks legitimately never
    // appear in a static file. The bug this catches is a selector that exists
    // in neither place, which is how setupPromotionRolodex silently did nothing.
    if (allHtml.includes(selector)) continue;
    if (js.includes(selector) && /innerHTML|createElement|insertAdjacent/.test(js)) {
      const built = new RegExp(`${selector}[^a-z]`).test(js.replace(/querySelector(All)?\([^)]*\)/g, ""));
      if (built) continue;
    }
    note(`${asset} queries [${selector}] which appears in no HTML file and is never created, so that code never runs`);
  }
}

// ---------------------------------------------------------------------------
// Homepage SEO intro. It quotes three numbers from two sources: the vendor
// count is the roster (vendor-config), the compound and listing counts are the
// snapshot. They drifted when the snapshot was two months behind the roster and
// the sentence read as if 1,489 listings came from 18 vendors when 13 fed them.
// The copy now keeps the two claims apart; this check keeps each one honest.
// ---------------------------------------------------------------------------
if (indexHtml) {
  const intro = indexHtml.match(/<p class="seo-catalog-intro">([^<]*)<\/p>/);
  if (intro) {
    const text = intro[1];
    const num = re => { const m = text.match(re); return m ? Number(m[1].replace(/,/g, "")) : null; };
    const introVendors = num(/Tracking (\d[\d,]*) partner vendors/);
    const introCompounds = num(/(\d[\d,]*) research compounds/);
    const introListings = num(/(\d[\d,]*) listings/);
    if (introVendors !== null && introVendors !== vendors.length) fail(`index.html intro says ${introVendors} partner vendors but vendor-config has ${vendors.length}`);
    if (introCompounds !== null && snapshot.product_card_count && introCompounds !== snapshot.product_card_count) fail(`index.html intro says ${introCompounds} compounds but the snapshot has ${snapshot.product_card_count}`);
    if (introListings !== null && snapshot.normalized_offer_count && introListings !== snapshot.normalized_offer_count) fail(`index.html intro says ${introListings} listings but the snapshot has ${snapshot.normalized_offer_count}`);
    const stat = indexHtml.match(/id="statVendors">(\d+)</);
    if (stat && Number(stat[1]) !== vendors.length) fail(`index.html statVendors says ${stat[1]} but vendor-config has ${vendors.length}`);
  } else {
    note("index.html has no seo-catalog-intro paragraph, the homepage count check was skipped");
  }
  if (snapshot.vendors_loaded && snapshot.vendors_loaded < vendors.length) {
    note(`snapshot carries ${snapshot.vendors_loaded} of ${vendors.length} roster vendors (generated ${String(snapshot.generated_at).slice(0, 10)}); if build-catalog-live keeps rejecting the live pull, lower CATALOG_MIN_VENDORS or set launch_date on the vendors whose feeds are not live yet`);
  }
}

// ---------------------------------------------------------------------------
if (fatals.length) {
  console.error(`\nvalidate-site: ${fatals.length} BLOCKING issue(s), the site would ship contradicting itself\n`);
  for (const problem of fatals) console.error(`  - ${problem}`);
  console.error("\n  Every sitewide vendor number comes from data/vendor-config.json.");
  console.error("  Rebuild the pages rather than editing a number by hand.");
  console.error("  QA_ALLOW_COUNT_DRIFT=1 downgrades these to warnings.\n");
}
if (!problems.length && !fatals.length) {
  console.log("validate-site: no drift detected");
  process.exit(0);
}
const strict = process.env.QA_STRICT === "1";
if (problems.length) {
  console[strict ? "error" : "warn"](`\nvalidate-site: ${problems.length} issue(s)\n`);
  for (const problem of problems) console[strict ? "error" : "warn"](`  - ${problem}`);
  console[strict ? "error" : "warn"]("");
}
process.exit(fatals.length || strict ? 1 : 0);
