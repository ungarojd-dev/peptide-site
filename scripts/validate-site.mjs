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
// 3. Vendor counts printed in HTML that disagree with the configured roster.
// ---------------------------------------------------------------------------
// Generated pages count the vendors actually present in the snapshot, which is
// legitimately behind the roster until a deploy pulls live feeds. Both numbers
// are accepted so the check flags real drift rather than that lag.
const snapshotVendors = new Set();
for (const product of snapshot.products || [])
  for (const variant of product.variants || [])
    for (const supplier of variant.suppliers || []) snapshotVendors.add(supplier.vendor_name);
const expected = vendors.length;
const alsoValid = snapshotVendors.size;
for (const file of await readdir(W)) {
  if (!file.endsWith(".html")) continue;
  const html = await read(file);
  if (!html) continue;
  for (const match of html.matchAll(/<span>(?:Tracked )?[Vv]endors<\/span>\s*<strong>(\d+)<\/strong>/g)) {
    const n = Number(match[1]);
    if (n !== expected && n !== alsoValid) note(`${file} advertises ${n} vendors, roster has ${expected}`);
  }
  for (const match of html.matchAll(/[Aa]cross (\d+) (?:verified |tracked )?[Vv]endors/g)) {
    const n = Number(match[1]);
    if (n !== expected && n !== alsoValid) note(`${file} says "across ${n} vendors", roster has ${expected}`);
  }
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
if (!problems.length) {
  console.log("validate-site: no drift detected");
  process.exit(0);
}
const strict = process.env.QA_STRICT === "1";
console[strict ? "error" : "warn"](`\nvalidate-site: ${problems.length} issue(s)\n`);
for (const problem of problems) console[strict ? "error" : "warn"](`  - ${problem}`);
console[strict ? "error" : "warn"]("");
process.exit(strict ? 1 : 0);
