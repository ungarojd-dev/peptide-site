// Expands the human-friendly data/deals.json (edited via the /admin portal)
// into the full data/promotions.json that every surface on the site reads.
//
// Why this exists: promotions.json accreted ~44 fields with heavy overlap
// (announce_offer / strip_offer / headline all restating the same thing). A
// person should not fill out 44 fields. They fill out ~10 clean ones here, and
// this derives the rest so the strip, carousel, row labels and roundup all
// stay in sync from a single edit.
//
// Run in the build chain BEFORE build-catalog-fallback so pricing picks up any
// discount_override_percent this produces.

import { readFile, writeFile } from "node:fs/promises";

const W = process.cwd();

const VENDOR_CONFIG = JSON.parse(await readFile(`${W}/data/vendor-config.json`, "utf8")).vendors || {};
const source = JSON.parse(await readFile(`${W}/data/deals.json`, "utf8"));
const deals = Array.isArray(source.deals) ? source.deals : [];

// Deal types the site understands. A genuinely new type needs an engine change;
// everything here maps onto behaviour that already exists.
const KNOWN_TYPES = new Set([
  "sitewide_sale",    // a % off the whole store, optionally stacking a code
  "code_only",        // just the standing SAMMYC code, no sitewide sale
  "conditional",      // buy-x-get-y, bulk pricing: no single % applies
  "first_order",      // new-customer code
  "new_partner",      // "now tracked" announcement
  "community"         // Skool / non-vendor announcement
]);

const errors = [];
const slug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Convert a plain date (YYYY-MM-DD) plus a timezone into an ISO instant. Start
// is midnight, end is 23:59 local, so a deal dated the 26th ends when the 26th
// ends in its own timezone rather than in UTC.
function offsetFor(tz, dateStr, endOfDay) {
  const time = endOfDay ? "23:59:00" : "00:00:00";
  // Derive the tz offset on that date via Intl, then bake it into the string.
  const probe = new Date(`${dateStr}T${time}Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, timeZoneName: "shortOffset"
  }).formatToParts(probe);
  const tzName = parts.find(p => p.type === "timeZoneName")?.value || "GMT-4";
  const m = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(tzName);
  const sign = m ? m[1][0] : "-";
  const hh = m ? String(Math.abs(parseInt(m[1], 10))).padStart(2, "0") : "04";
  const mm = m && m[2] ? m[2] : "00";
  return `${dateStr}T${time}${sign}${hh}:${mm}`;
}

function compoundedOverride(salePercent, codePercent) {
  const s = Number(salePercent) || 0;
  const c = Number(codePercent) || 0;
  if (!s && !c) return null;
  // Sitewide sale first, then the code on the reduced price (multiplicative),
  // matching how vendor checkouts stack a coupon on an already-discounted cart.
  return Number(((1 - (1 - s / 100) * (1 - c / 100)) * 100).toFixed(2));
}

function expand(deal) {
  const vendor = deal.vendor;
  if (!vendor) { errors.push(`Deal ${deal.id || "(no id)"} has no vendor`); return null; }
  if (deal.type && !KNOWN_TYPES.has(deal.type)) {
    errors.push(`Deal ${deal.id}: unknown type "${deal.type}". Known: ${[...KNOWN_TYPES].join(", ")}`);
  }
  const tz = deal.timezone || "America/New_York";
  const brand = VENDOR_CONFIG[vendor]?.brand_color || "#a9d13a";
  const affiliate = deal.affiliate_url || VENDOR_CONFIG[vendor]?.affiliate_url || "#";
  const show = new Set(Array.isArray(deal.show_in) ? deal.show_in : []);
  const code = deal.code || "SAMMYC";

  const out = {
    id: deal.id || `${slug(vendor)}-${slug(deal.headline) || "deal"}`,
    vendor,
    display_vendor: deal.display_vendor || vendor,
    brand_color: brand,
    affiliate_url: affiliate,
    cta_text: deal.cta_text || "Shop now",
    headline: deal.headline || "",
    short_detail: deal.description || deal.headline || "",
    full_detail: deal.description || deal.headline || "",
    priority: Number(deal.priority) || 300
  };

  if (deal.start_date) out.start_at = offsetFor(tz, deal.start_date, false);
  if (deal.end_date) out.end_at = offsetFor(tz, deal.end_date, true);

  // Pricing: only sitewide_sale and code_only move the $/mg math.
  if (deal.type === "sitewide_sale") {
    // A flat_rate deal is a single all-in percentage that does NOT stack a
    // separate code (e.g. "34% off with any code"). Set flat_rate to that
    // number. Otherwise sale_percent stacks with code_percent multiplicatively.
    if (deal.flat_rate != null) {
      out.discount_override_percent = Number(deal.flat_rate);
      out.strip_stack = code;
    } else {
      out.sale_percent = Number(deal.sale_percent) || 0;
      out.code_percent = Number(deal.code_percent ?? VENDOR_CONFIG[vendor]?.discount_percent ?? 0);
      const override = compoundedOverride(out.sale_percent, out.code_percent);
      if (override != null) out.discount_override_percent = override;
      out.strip_stack = code;
    }
  } else if (deal.type === "code_only") {
    out.code_percent = Number(deal.code_percent ?? VENDOR_CONFIG[vendor]?.discount_percent ?? 0);
  } else if (deal.type === "conditional") {
    out.conditional_deal = true;
    if (deal.chip_label) out.chip_label = deal.chip_label;
  }

  // Category scoping (e.g. a GLP-only sale).
  if (Array.isArray(deal.scope_categories) && deal.scope_categories.length) {
    out.scope_categories = deal.scope_categories;
  }

  // Surface flags, derived from the single show_in list.
  if (show.has("strip")) {
    out.show_in_strip = true;
    out.strip_tube = deal.strip_tube || (deal.type === "new_partner" ? "New partner" : deal.type === "first_order" ? "New customers" : "Live now");
    out.strip_offer = deal.headline || "";
    if (deal.code && deal.type === "first_order") out.strip_code = deal.code;
    if (deal.type === "sitewide_sale") out.strip_stack = code;
  }
  if (show.has("carousel")) {
    out.show_in_announce_bar = true;
    out.show_in_announcement_rolodex = true;
    out.badge = deal.badge || (deal.end_date ? "LIMITED TIME" : "NOW LIVE");
    out.announce_tube = deal.strip_tube || "Live now";
    out.announce_offer = deal.headline || "";
    if (out.sale_percent != null && out.code_percent) out.announce_note = `plus ${out.code_percent}% with`;
  }
  // roundup reads everything from the fields above, no extra flag needed.
  out.show_vendor_badge = show.has("carousel");
  out.show_in_rolodex = show.has("carousel");

  if (deal.type === "new_partner") {
    if (deal.start_date) out.partner_since = deal.start_date;
    out.keep_after_window = false;
  }

  return out;
}

const promotions = deals.map(expand).filter(Boolean);

if (errors.length) {
  console.error("Deal expansion errors:");
  errors.forEach(e => console.error("  - " + e));
  process.exit(1);
}

const payload = {
  version: `deals-${new Date().toISOString().slice(0, 10)}`,
  updated_at: new Date().toISOString(),
  _generated: "Built from data/deals.json by scripts/build-promotions.mjs. Do not edit by hand.",
  promotions
};

await writeFile(`${W}/data/promotions.json`, JSON.stringify(payload, null, 2) + "\n");
console.log(`Expanded ${deals.length} deals into ${promotions.length} promotions.`);
