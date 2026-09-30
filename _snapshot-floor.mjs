// Is this snapshot complete enough to rebuild the whole site from?
//
// build-catalog-live falls back to the committed snapshot whenever a live pull
// is short, on the principle that "a stale but complete snapshot beats a fresh
// partial one". That principle is only true while the committed snapshot really
// is complete. On 2026-09-30 it was a 7 product, 4 vendor seed dated 2026-09-22,
// the live pull came up short, and the build regenerated 100+ static pages from
// the seed: every compound page, every hub, and a vendors page listing 4 of 18
// vendors, all published as a successful deploy.
//
// The information needed to catch it was already in the build log. Nothing acted
// on it. So now something does: a snapshot below the floor fails the build. A
// failed deploy keeps the last good site published, which is always better than
// publishing a site with three quarters of the catalog missing.

export function describeSnapshot(snap) {
  const vendors = new Set();
  let listings = 0;
  for (const product of snap?.products || []) {
    for (const variant of product.variants || []) {
      for (const supplier of variant.suppliers || []) {
        if (supplier.vendor_name) vendors.add(supplier.vendor_name);
        listings += 1;
      }
    }
  }
  return {
    products: (snap?.products || []).length,
    listings,
    vendors: vendors.size,
    vendorNames: [...vendors].sort(),
    generated_at: snap?.generated_at || "unknown"
  };
}

// configuredVendors lets the vendor floor track the roster instead of being a
// number somebody has to remember to raise when a vendor is added.
export function assertSnapshotUsable(snap, { configuredVendors = 0, label = "snapshot" } = {}) {
  const seen = describeSnapshot(snap);
  if (process.env.ALLOW_PARTIAL_CATALOG === "1") {
    console.warn(`  ALLOW_PARTIAL_CATALOG=1 set, accepting ${label}: ${seen.vendors} vendors, ${seen.products} products`);
    return seen;
  }

  const minVendors = Number.parseInt(process.env.CATALOG_FALLBACK_MIN_VENDORS || "", 10)
    || Math.max(6, Math.ceil(configuredVendors * 0.5));
  const minProducts = Number.parseInt(process.env.CATALOG_FALLBACK_MIN_PRODUCTS || "", 10) || 50;

  if (seen.vendors >= minVendors && seen.products >= minProducts) return seen;

  console.error("");
  console.error("  BUILD STOPPED: the catalog snapshot is too thin to rebuild the site from.");
  console.error("");
  console.error(`    ${label}: ${seen.vendors} vendors, ${seen.products} products, ${seen.listings} listings, generated ${seen.generated_at}`);
  console.error(`    floor:    ${minVendors} vendors, ${minProducts} products`);
  if (seen.vendorNames.length) console.error(`    vendors present: ${seen.vendorNames.join(", ")}`);
  console.error("");
  console.error("  Regenerating every static page from this would publish a site missing");
  console.error("  most of the catalog. Failing instead keeps the last good deploy live.");
  console.error("");
  console.error("  Look further up this log for 'build-catalog-live:' to see which vendor");
  console.error("  feeds failed. Then either fix the feed, or waive a vendor that is");
  console.error("  genuinely down with CATALOG_ALLOW_MISSING=\"Vendor Name\".");
  console.error("  ALLOW_PARTIAL_CATALOG=1 forces the build through if you truly want it.");
  console.error("");
  process.exit(1);
}
