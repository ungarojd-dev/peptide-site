// Pre-renders a static, crawlable summary of the catalog into index.html.
//
// Why: the live catalog is client-rendered into #catalogGrid, so a crawler that
// does not execute JS sees only "Loading catalog" on the page we most want to
// rank. This injects real compound names, lowest prices and vendor counts into
// the HTML. CatalogUI overwrites #catalogGrid via innerHTML on boot, so the
// static block is replaced the moment JS runs and users never see both.
//
// Run after build-catalog-fallback so the snapshot is current.

import { readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";

const W = process.cwd();
const START = "<!--CATALOG_SEO_START-->";
const END = "<!--CATALOG_SEO_END-->";

const esc = value =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const slug = value =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const money = value => {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "";
};
// "$" is special inside a String.replace replacement, so escape it there.
const rep = value => String(value).replace(/\$/g, "$$$$");

const snapshot = JSON.parse(await readFile(`${W}/data/catalog-fallback-snapshot.json`, "utf8"));
const cards = snapshot.product_cards || snapshot.cards || snapshot.products || [];
if (!cards.length) {
  console.error("No cards in snapshot, aborting so the page is not emptied.");
  process.exit(1);
}

const pages = new Set(readdirSync(`${W}/compounds`).map(f => f.replace(/\.html$/, "")));

const rows = cards
  .slice()
  .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  .map(card => {
    const sg = pages.has(slug(card.id)) ? slug(card.id) : pages.has(slug(card.name)) ? slug(card.name) : "";
    const low = money(card.lowest_effective_price);
    const vendors = Number(card.supplier_count) || 0;
    const formats = Array.isArray(card.format_labels) && card.format_labels.length
      ? card.format_labels.join(", ")
      : card.format || "";
    const title = sg
      ? `<a class="seo-card-name" href="/compounds/${esc(sg)}.html">${esc(card.name)}</a>`
      : `<span class="seo-card-name">${esc(card.name)}</span>`;
    const priceBit = low
      ? `<span class="seo-card-price">from <strong>${esc(low)}</strong></span>`
      : "";
    const vendorBit = vendors
      ? `<span class="seo-card-vendors">${vendors} vendor${vendors === 1 ? "" : "s"}</span>`
      : "";
    const catBit = card.category ? `<span class="seo-card-cat">${esc(card.category)}</span>` : "";
    const fmtBit = formats ? `<span class="seo-card-fmt">${esc(formats)}</span>` : "";
    return `<li class="seo-card">${title}${priceBit}${vendorBit}${catBit}${fmtBit}</li>`;
  })
  .join("");

const vendorCfg = JSON.parse(await readFile(`${W}/data/vendor-config.json`, "utf8"));
const vendorCount = Object.keys(vendorCfg.vendors || {}).length;
const offerCount = Number(snapshot.normalized_offer_count) || 0;

const block = `${START}
<div class="seo-catalog" data-seo-catalog>
  <p class="seo-catalog-intro">Tracking ${cards.length} research compounds across ${vendorCount} vendors${offerCount ? `, ${offerCount.toLocaleString("en-US")} listings` : ""}. Prices shown are the lowest tracked estimate after known discount codes. Full comparison loads below.</p>
  <ul class="seo-catalog-list">${rows}</ul>
</div>
${END}`;

const indexPath = `${W}/index.html`;
let html = await readFile(indexPath, "utf8");

const hasBlock = html.includes(START) && html.includes(END);
if (hasBlock) {
  html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
} else {
  const anchor = `<div class="catalog-grid" id="catalogGrid">`;
  if (!html.includes(anchor)) {
    console.error("Could not find #catalogGrid mount point, aborting.");
    process.exit(1);
  }
  html = html.replace(anchor, `${anchor}${block}`);
}

await writeFile(indexPath, html);
console.log(`Catalog SEO block written: ${cards.length} compounds, ${vendorCount} vendors, ${offerCount} listings`);

// ── Keep hardcoded homepage figures honest ────────────────────────────────
// The metrics strip is re-populated by CatalogUI at runtime, but crawlers and
// pre-hydration visitors see whatever is baked into the HTML. The hero preview
// is never JS-updated at all, so it silently goes stale as prices move. Both
// are rewritten here from the same snapshot the catalog uses.

let out = await readFile(indexPath, "utf8");
const before = out;

// Metrics strip
out = out.replace(
  /(<div class="metric-num" id="statCards">)[^<]*(<\/div>)/,
  `$1${cards.length}$2`
);
out = out.replace(
  /(<div class="metric-num" id="statVendors">)[^<]*(<\/div>)/,
  `$1${vendorCount}$2`
);

// Hero intro copy
out = out.replace(
  /Search [\d,]+\+? research products/,
  `Search ${cards.length} research compounds`
);

// Hero comparison preview, driven by the live BPC-157 10mg variant
const hero = cards.find(c => String(c.name).toUpperCase() === "BPC-157");
const variant = hero && (hero.variants || []).find(v =>
  /^10\s*mg/i.test(String(v.label || v.quantity_label || ""))
);
if (variant) {
  const offers = (variant.suppliers || [])
    .filter(s => s.effective_price_min != null)
    .sort((a, b) => Number(a.effective_price_min) - Number(b.effective_price_min));
  if (offers.length >= 3) {
    const low = Number(offers[0].effective_price_min);
    const high = Number(offers[offers.length - 1].effective_price_min);
    const initials = name =>
      String(name || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

    out = out.replace(
      /(<span class="hero-network-badge">)[^<]*(<\/span>)/,
      `$1${offers.length} offers$2`
    );

    // Three price cards, in rank order
    const blocks = out.match(/<div class="hero-price-card[^"]*">[\s\S]*?<\/div>\s*<\/div>/g) || [];
    blocks.slice(0, 3).forEach((block, i) => {
      const o = offers[i];
      let next = block
        .replace(/(<div class="hero-vendor-mark">)[^<]*(<\/div>)/, `$1${esc(initials(o.vendor_name))}$2`)
        .replace(/(<div class="hero-vendor-copy">\s*<strong>)[^<]*(<\/strong>)/, `$1${esc(o.vendor_name)}$2`)
        .replace(/(<div class="hero-vendor-price">[\s\S]*?<strong>)[^<]*(<\/strong>)/,
          `$1${rep(money(o.effective_price_min))}$2`);
      out = out.replace(block, next);
    });

    // Low / high / vendor-count summary
    out = out
      .replace(/(<div><strong>)\$[\d.,]+(<\/strong><span>lowest<\/span><\/div>)/, `$1${rep(money(low))}$2`)
      .replace(/(<div><strong>)\$[\d.,]+(<\/strong><span>highest<\/span><\/div>)/, `$1${rep(money(high))}$2`)
      .replace(/(<div><strong>)\d+(<\/strong><span>vendors<\/span><\/div>)/, `$1${offers.length}$2`);
  }
}

if (out !== before) {
  await writeFile(indexPath, out);
  console.log(`Homepage figures synced: ${cards.length} cards, ${vendorCount} vendors, hero preview from live BPC-157 10mg`);
}
