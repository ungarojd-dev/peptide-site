// Shared server-side catalog normalization for MyPeptidePrice.
// Every row returned by a vendor adapter passes through this module before it is stored.
// Important contract: classification may change a label, but it must never remove a row.

const GLP_CATEGORY = "GLP-1 & Incretin";
const KNOWN_CATEGORIES = new Set([
  GLP_CATEGORY,
  "Repair & Recovery",
  "Growth Hormone Research",
  "Bioregulators",
  "Metabolic & Mitochondrial",
  "Longevity & Cellular Health",
  "Cognitive & Nootropic",
  "Skin, Tanning & Sexual Health",
  "Capsules",
  "Supplies",
  "Other"
]);

const FAMILY_LABELS = {
  sm: "Peptide SM",
  tz: "Peptide TZ",
  rt: "Peptide RT",
  cagri: "Cagrilintide"
};

function asText(value) {
  if (Array.isArray(value)) return value.map(asText).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(asText).join(" ");
  return String(value || "");
}

function compactWhitespace(value) {
  return asText(value).replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsAny(text, terms) {
  return terms.some(term => text.includes(term));
}

function buildSearchText(product = {}) {
  return compactWhitespace([
    product.product,
    product.listing,
    product.raw_product,
    product.raw_listing,
    product.sku,
    product.slug,
    product.source_slug,
    product.category,
    product.raw_category,
    product.format
  ].join(" ")).toLowerCase();
}

function has(text, regex) {
  return regex.test(text);
}

export function detectGlpComponents(product = {}) {
  const text = buildSearchText(product);
  const components = [];
  const add = component => {
    if (!components.includes(component)) components.push(component);
  };

  if (
    text.includes("semaglutide") ||
    has(text, /\bsema\b/) ||
    has(text, /\b(?:pep[\s-]*sm|peptide[\s-]*sm|gla-1\s*sm|glp-1\s*sm|ion-1s|sa-1s)\b/) ||
    has(text, /\bsm\b/)
  ) add("sm");

  if (
    text.includes("tirzepatide") ||
    has(text, /\btirz(?:ep)?\b/) ||
    has(text, /\b(?:pep[\s-]*(?:tz|trz)|peptide[\s-]*(?:tz|trz)|gla-2(?:\.5)?\s*trz|glp-2\s*trz|glp2-t|glp-t2|ion-2t|mhc-2\s*trz|sa-2t)\b/) ||
    has(text, /\b(?:tz|trz)\b/)
  ) add("tz");

  if (
    text.includes("retatrutide") ||
    has(text, /\breta\b/) ||
    has(text, /\b(?:pep[\s-]*rt|peptide[\s-]*rt|gla-3\s*rt|glp-3\s*rt|glp-3r|glp3-r|glp-r3|ion-3r|oc-3rt|sa-3r)\b/) ||
    has(text, /\brt\b/)
  ) add("rt");

  if (
    text.includes("cagrilintide") ||
    text.includes("cagrilinitide") ||
    has(text, /\bcagri\b/) ||
    has(text, /\b(?:pep[\s-]*cag|sa-4c)\b/)
  ) add("cagri");

  return components;
}

function canonicalGlpName(components) {
  if (!components.length) return null;
  if (components.length === 1) return FAMILY_LABELS[components[0]] || null;
  const ordered = ["cagri", "sm", "tz", "rt"].filter(component => components.includes(component));
  return `${ordered.map(component => FAMILY_LABELS[component]).join(" + ")} Blend`;
}

function extractVariationSuffix(rawProduct, rawListing) {
  const product = compactWhitespace(rawProduct);
  const listing = compactWhitespace(rawListing);

  if (product && listing && listing !== product) {
    const prefix = new RegExp(`^${escapeRegex(product)}\\s*(?:-|/|\\||:)\\s*(.+)$`, "i");
    const match = listing.match(prefix);
    if (match && match[1]) return compactWhitespace(match[1]);
  }

  const trailingDose = (listing || product).match(/(\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu)(?:\s*(?:\/|\+)\s*\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu))?)\s*$/i);
  return trailingDose && trailingDose[1] ? compactWhitespace(trailingDose[1]) : "";
}

function looksLikeGlpCandidate(product = {}) {
  const text = buildSearchText(product);
  return [
    "glp", "sema", "tirz", "reta", "retatrutide", "semaglutide", "tirzepatide",
    "cagri", "cagrilintide", "pep-sm", "pep-tz", "pep-trz", "pep-rt", "pep-cag",
    "ion-1", "ion-2", "ion-3", "gla-1", "gla-2", "gla-3", "sa-2", "sa-3", "sa-4",
    "oc-3rt", "trz/rt", "tz/rt"
  ].some(term => text.includes(term));
}

export function classifyCatalogCategory(product = {}) {
  const text = buildSearchText(product);
  const existing = compactWhitespace(product.category);
  const components = detectGlpComponents(product);

  if (components.length || containsAny(text, [
    "glp", "mazdutide", "survodutide", "liraglutide", "amycretin", "orforglipron",
    "tesofensine", "metaboflex", "weight loss"
  ])) return GLP_CATEGORY;

  if (containsAny(text, [
    "bacteriostatic", "sterile water", "reconstitution water", "acetic acid", "syringe",
    "needle", "vial cap", "vial cover", "vial case", "storage case", "travel case", "cartridge",
    "research starter kit", "supplies", "supply", "pen needle", "reusable peptide pen"
  ])) return "Supplies";

  if (containsAny(text, ["capsule", "tablet", "troche", "oral strip", "dissolvable strip"])) return "Capsules";

  if (containsAny(text, [
    "bpc", "tb-500", "tb500", "wolverine", "kpv", "ll-37", "ll37", "ara-290", "thymalin",
    "thymulin", "repair", "recovery", "recover", "healing"
  ])) return "Repair & Recovery";

  if (containsAny(text, [
    "ipamorelin", "cjc", "ghrp", "ghrh", "sermorelin", "tesamorelin", "hexarelin", "igf",
    "growth hormone", "mod grf", "peg-mgf", "mgf"
  ])) return "Growth Hormone Research";

  if (containsAny(text, [
    "cartalax", "testagen", "vesugen", "pinealon", "thymogen", "ovagen", "prostamax", "chondroguard",
    "bioregulator"
  ])) return "Bioregulators";

  if (containsAny(text, [
    "semax", "selank", "dihexa", "cerebrolysin", "nootropic", "cognitive", "vip", "adamax", "pe-22-28"
  ])) return "Cognitive & Nootropic";

  if (containsAny(text, [
    "melanotan", "mt-1", "mt-2", "pt-141", "bremelanotide", "kisspeptin", "sexual", "tanning"
  ])) return "Skin, Tanning & Sexual Health";

  if (containsAny(text, [
    "nad", "epitalon", "epithalon", "snap-8", "humanin", "foxo4", "ss-31", "s-31", "§-31",
    "mtp", "mots-c", "ghk-cu", "ahk-cu", "dsip", "thymosin alpha", "longevity", "anti-aging", "anti aging"
  ])) return "Longevity & Cellular Health";

  if (containsAny(text, [
    "aod", "mots", "lipo", "metabolic", "mitochondrial", "energy", "5-amino", "slu-pp", "glutathione",
    "l-carnitine", "metholine blue", "methylene blue", "klow", "glow blend"
  ])) return "Metabolic & Mitochondrial";

  return KNOWN_CATEGORIES.has(existing) ? existing : "Other";
}

export function normalizeProduct(product = {}) {
  const rawProduct = compactWhitespace(product.raw_product || product.product || product.name || product.title || product.listing || "Unnamed API Product");
  const rawListing = compactWhitespace(product.raw_listing || product.listing || rawProduct || "Unnamed API Product");
  const rawCategory = compactWhitespace(product.raw_category || product.source_category || product.vendor_category || product.original_category || product.category);

  const normalized = {
    ...product,
    raw_product: rawProduct,
    raw_listing: rawListing,
    raw_category: rawCategory,
    product: rawProduct || "Unnamed API Product",
    listing: rawListing || rawProduct || "Unnamed API Product"
  };

  const components = detectGlpComponents(normalized);
  const canonicalName = canonicalGlpName(components);

  if (canonicalName) {
    const variationSuffix = extractVariationSuffix(rawProduct, rawListing);
    normalized.product = canonicalName;
    normalized.listing = variationSuffix ? `${canonicalName} - ${variationSuffix}` : canonicalName;
    normalized.canonical_family = canonicalName;
    normalized.components = components;
    normalized.normalization_status = canonicalName === rawProduct ? "matched" : "renamed";
  } else {
    normalized.canonical_family = null;
    normalized.components = [];
    normalized.normalization_status = looksLikeGlpCandidate(normalized) ? "unmapped_glp_candidate" : "unchanged";
  }

  normalized.category = classifyCatalogCategory(normalized);
  return normalized;
}

export function buildNormalizationDiagnostics(products = [], feedDiagnostics = {}) {
  const byVendor = {};
  const unmapped = [];
  const uncategorized = [];

  for (const product of products) {
    const vendor = product.company || "Unknown vendor";
    if (!byVendor[vendor]) {
      byVendor[vendor] = {
        rows: 0,
        glp_rows: 0,
        renamed_rows: 0,
        uncategorized_rows: 0,
        unmapped_glp_candidates: 0,
        ingestion_warning_rows: 0
      };
    }

    const row = byVendor[vendor];
    row.rows += 1;
    if (Array.isArray(product.components) && product.components.length) row.glp_rows += 1;
    if (product.normalization_status === "renamed") row.renamed_rows += 1;
    if (product.ingestion_warning) row.ingestion_warning_rows += 1;
    if (product.category === "Other") {
      row.uncategorized_rows += 1;
      if (uncategorized.length < 500) {
        uncategorized.push({
          vendor,
          raw_product: product.raw_product || product.product,
          raw_listing: product.raw_listing || product.listing,
          sku: product.sku || "",
          raw_category: product.raw_category || "",
          warning: product.ingestion_warning || ""
        });
      }
    }
    if (product.normalization_status === "unmapped_glp_candidate") {
      row.unmapped_glp_candidates += 1;
      if (unmapped.length < 300) {
        unmapped.push({
          vendor,
          raw_product: product.raw_product || product.product,
          raw_listing: product.raw_listing || product.listing,
          sku: product.sku || "",
          raw_category: product.raw_category || ""
        });
      }
    }
  }

  const feedRows = Object.values(feedDiagnostics);
  const integrity = {
    source_products: feedRows.reduce((sum, feed) => sum + Number(feed.source_product_count || 0), 0),
    returned_rows: feedRows.reduce((sum, feed) => sum + Number(feed.returned_row_count || 0), 0),
    represented_source_products: feedRows.reduce((sum, feed) => sum + Number(feed.represented_source_products || 0), 0),
    unrepresented_source_products: feedRows.reduce((sum, feed) => sum + Number(feed.unrepresented_source_products || 0), 0),
    explicit_exclusions: feedRows.reduce((sum, feed) => sum + Number(feed.explicit_exclusions || 0), 0),
    transform_fallback_rows: feedRows.reduce((sum, feed) => sum + Number(feed.transform_fallback_rows || 0), 0),
    variation_fetch_errors: feedRows.reduce((sum, feed) => sum + Number(feed.variation_fetch_errors || 0), 0),
    feeds_with_unrepresented_products: Object.entries(feedDiagnostics)
      .filter(([, feed]) => Number(feed.unrepresented_source_products || 0) > 0)
      .map(([vendor]) => vendor)
  };

  return {
    schema_version: "ingestion-v3",
    generated_at: new Date().toISOString(),
    total_rows: products.length,
    integrity,
    vendors: byVendor,
    uncategorized_products: uncategorized,
    unmapped_glp_candidates: unmapped,
    feeds: feedDiagnostics
  };
}
