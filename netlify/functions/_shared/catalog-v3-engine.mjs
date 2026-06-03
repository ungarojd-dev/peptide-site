import catalogPayload from "../../../data/catalog-v3-products.json" with { type: "json" };
import overridePayload from "../../../data/catalog-v3-overrides.json" with { type: "json" };
import vendorPayload from "../../../data/vendor-config.json" with { type: "json" };

export const ENGINE_VERSION = "3.0.0-preview";
export const COUPON_CODE = vendorPayload.coupon_code || "SAMMYC";
export const VENDOR_CONFIG = vendorPayload.vendors || {};

const GLP_CATEGORY = "GLP-1 & Incretin";
const DEFAULT_CATEGORY = "Other";
const DEFAULT_FORMAT = "Vials";
const SUPPLY_TERMS = [
  "bacteriostatic", "bac water", "sterile water", "reconstitution water", "acetic acid",
  "syringe", "needle", "pen needle", "vial cap", "vial cover", "storage case", "travel case",
  "cartridge", "starter kit", "supplies", "supply"
];
const FORMAT_TERMS = {
  "Dissolvable Strips": ["buccal strip", "dissolvable strip", "oral strip", "lozenge"],
  "Capsules": ["capsule", "capsules", "tablet", "tablets", "tab", "tabs", "troche", "oral"],
  "Nasal Sprays": ["nasal spray", "nasal", "intranasal", "spray"],
  "Topicals": ["topical", "cream", "serum", "lotion", "gel", "mask", "shampoo", "conditioner", "balm"],
  "Liquids": ["liquid", "drops", "solution", "lemon bottle", "methylene blue", "metholine blue", "lipo-c"],
  "Aminos": ["amino", "l-carnitine", "carnitine"]
};
const CATEGORY_TERMS = [
  [GLP_CATEGORY, ["glp", "semaglutide", "tirzepatide", "retatrutide", "cagrilintide", "cagri", "mazdutide", "survodutide", "liraglutide", "tesofensine", "orforglipron", "amycretin", "weight loss"]],
  ["Repair & Recovery", ["bpc", "tb-500", "tb500", "kpv", "ll-37", "ll37", "wolverine", "repair", "recovery", "recover", "healing", "ara-290"]],
  ["Growth Hormone Research", ["cjc", "ipamorelin", "sermorelin", "tesamorelin", "ghrp", "hexarelin", "igf", "hgh", "growth hormone", "modified grf", "mod grf", "peg-mgf", "mgf"]],
  ["Cognitive & Nootropic", ["semax", "selank", "dihexa", "cerebrolysin", "vip", "dsip", "nootropic", "cognitive", "adamax", "pe-22", "p21"]],
  ["Skin, Tanning & Sexual Health", ["pt-141", "pt141", "melanotan", "mt-1", "mt-2", "kisspeptin", "oxytocin", "tanning", "sexual health", "bremelanotide"]],
  ["Bioregulators", ["pinealon", "vilon", "vesugen", "pancragen", "bronchogen", "cardiogen", "ovagen", "livagen", "thymagen", "thymalin", "thymulin", "cartalax", "bioregulator"]],
  ["Metabolic & Mitochondrial", ["mots", "ss-31", "s-31-s", "§-31", "5-amino", "aod", "slu-pp", "glutathione", "lipo-c", "aicar", "adipotide", "metabolic", "mitochondrial"]],
  ["Longevity & Cellular Health", ["nad", "ghk", "ahk", "snap-8", "foxo4", "humanin", "epitalon", "thymosin alpha", "longevity", "cellular", "anti-aging", "anti aging"]]
];
const LEGACY_CATEGORIES = {
  "GLP / Weight Loss": GLP_CATEGORY,
  "Recovery & Healing": "Repair & Recovery",
  "Longevity & Anti-Aging": "Longevity & Cellular Health",
  "Growth Hormone": "Growth Hormone Research",
  "Sexual Health & Tanning": "Skin, Tanning & Sexual Health",
  "Metabolic & Energy": "Metabolic & Mitochondrial",
  "Capsules": "Other",
  "Other": "Other"
};

function text(value) {
  return value == null ? "" : String(value);
}
function compact(value) {
  return text(value).replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
}
function normalized(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9§]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function slug(value) {
  return normalized(value).replace(/\s+/g, "-") || "untitled-product";
}
function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}
function includesAny(haystack, needles) {
  return needles.some(needle => haystack.includes(needle));
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function phraseRegex(alias) {
  const norm = normalized(alias);
  const body = escapeRegex(norm).replace(/\\ /g, "[\\s\\-_/+.]+");
  return new RegExp(`(?:^|[^a-z0-9])${body}(?:$|[^a-z0-9])`, "i");
}
function money(value) {
  return `$${Number(value).toFixed(2)}`;
}
function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
function priceNumbers(value) {
  const raw = compact(value).replace(/,/g, "");
  if (!raw) return [];
  const dollarMatches = [...raw.matchAll(/\$(\d+(?:\.\d+)?)/g)].map(match => Number(match[1]));
  if (dollarMatches.length) return dollarMatches.filter(Number.isFinite);
  if (/^\d+(?:\.\d+)?$/.test(raw)) return [Number(raw)];
  return [];
}
function formatPriceRange(numbers) {
  const values = unique((numbers || []).map(number => roundMoney(number))).sort((a, b) => a - b);
  if (!values.length) return "Contact for price";
  if (values.length === 1) return money(values[0]);
  return `${money(values[0])} to ${money(values[values.length - 1])}`;
}

const recordById = new Map((catalogPayload.products || []).map(record => [record.id, record]));
const aliasEntries = [];
for (const record of catalogPayload.products || []) {
  for (const alias of unique([record.name, ...(record.aliases || [])])) {
    const norm = normalized(alias);
    if (!norm) continue;
    aliasEntries.push({ record, alias, norm, tokens: norm.split(/\s+/).length, length: norm.length, regex: phraseRegex(alias) });
  }
}
aliasEntries.sort((a, b) => b.tokens - a.tokens || b.length - a.length);

const forcedAliases = Object.entries(overridePayload.forced_aliases || {})
  .map(([alias, id]) => ({ alias, id, norm: normalized(alias), regex: phraseRegex(alias) }))
  .sort((a, b) => b.norm.split(/\s+/).length - a.norm.split(/\s+/).length || b.norm.length - a.norm.length);

const BLEND_COMPONENTS = [
  ["Semaglutide", ["semaglutide", "sema", "pep-sm", "peptide sm", "gla-1 sm", "ion-1s", "sa-1s"]],
  ["Tirzepatide", ["tirzepatide", "tirz", "trz", "pep-trz", "pep-tz", "peptide trz", "peptide tz", "gla-2 trz", "glp-t2", "ion-2t", "sa-2t"]],
  ["Retatrutide", ["retatrutide", "reta", "pep-rt", "peptide rt", "gla-3 rt", "glp-r3", "ion-3r", "sa-3r", "oc-3rt"]],
  ["Cagrilintide", ["cagrilintide", "cagrilinitide", "cagri", "pep-cag", "sa-4c"]],
  ["BPC-157", ["bpc-157", "bpc157"]],
  ["TB-500", ["tb-500", "tb500", "tb-4", "tb4"]],
  ["GHK-Cu", ["ghk-cu", "ghk cu", "ghkcu"]],
  ["KPV", ["kpv"]],
  ["CJC-1295", ["cjc-1295", "cjc 1295"]],
  ["Ipamorelin", ["ipamorelin", "ipamo"]],
  ["Tesamorelin", ["tesamorelin", "tesa"]],
  ["Semax", ["semax"]],
  ["Selank", ["selank"]],
  ["MOTS-c", ["mots-c", "mots c", "motsc"]],
  ["SS-31", ["ss-31", "s-31-s", "§-31"]]
];

function detectBlendComponents(value) {
  const norm = normalized(value);
  const found = [];
  for (const [name, aliases] of BLEND_COMPONENTS) {
    if (aliases.some(alias => phraseRegex(alias).test(norm))) found.push(name);
  }
  return unique(found);
}
function looksLikeBlend(value, components) {
  const raw = compact(value).toLowerCase();
  return components.length > 1 && (/\bblend\b|\bwolverine\b|\+|\/|,|\band\b/.test(raw));
}
function blendRecord(value) {
  const components = detectBlendComponents(value);
  if (!looksLikeBlend(value, components)) return null;
  const name = `${components.join(" + ")} Blend`;
  const id = slug(name);
  return { id, name, category: inferCategory(name, {}), aliases: [], dynamic: true };
}

function cleanFallbackName(value) {
  let cleaned = compact(value || "Untitled product")
    .replace(/^(glacier\s+aminos?|ion\s+peptide|southern\s+aminos?|labsourced\s+peptides?|mile\s+high\s+(?:compounds?|peptides?)?|solyn\s+labs?|oneday\s+compounds?|glow\s+aminos?|flawless\s+compounds?|instant\s+peptides?)\s*[-:|]?\s*/i, "")
    .replace(/\b(?:research\s+)?peptide\s+vial\b/ig, "")
    .replace(/\b(?:vial|capsules?|tablets?|sprays?|topicals?|liquids?)\b\s*$/ig, "")
    .replace(/(?:^|\s|[-:,(])\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu|units?|caps?|capsules?|tablets?|vials?|ct|pack)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu|units?))?/gi, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*[-:/|]\s*$/g, "")
    .trim();
  return cleaned || compact(value) || "Untitled product";
}

function findCanonicalRecord(raw) {
  const sourceText = [raw.product, raw.listing, raw.sku].filter(Boolean).join(" ");
  const search = normalized(sourceText);
  const blend = blendRecord(sourceText);
  if (blend) return { ...blend, mapped: true, mapping: "blend-components" };
  for (const forced of forcedAliases) {
    if (!forced.regex.test(search)) continue;
    const record = recordById.get(forced.id);
    if (record) return { ...record, mapped: true, mapping: `forced-alias:${forced.alias}` };
  }
  for (const entry of aliasEntries) {
    if (entry.regex.test(search)) return { ...entry.record, mapped: true, mapping: `catalog-alias:${entry.alias}` };
  }
  const name = cleanFallbackName(raw.product || raw.listing || "Untitled product");
  return { id: slug(name), name, category: inferCategory(name, raw), aliases: [], mapped: false, mapping: "visible-unmapped" };
}

function inferCategory(family, raw) {
  const sourceCategory = compact(raw.raw_category || raw.source_category || raw.category || "");
  const haystack = normalized([family, raw.product, raw.listing, raw.sku, sourceCategory].filter(Boolean).join(" "));
  if (includesAny(haystack, SUPPLY_TERMS)) return "Supplies";
  for (const [category, terms] of CATEGORY_TERMS) {
    if (includesAny(haystack, terms)) return category;
  }
  return LEGACY_CATEGORIES[sourceCategory] || sourceCategory || DEFAULT_CATEGORY;
}

function inferFormat(raw, category, family) {
  const override = (overridePayload.format_overrides || {})[normalized(family)];
  if (override) return override;
  const haystack = normalized([raw.product, raw.listing, raw.sku, raw.format, family].filter(Boolean).join(" "));
  if (category === "Supplies" || includesAny(haystack, SUPPLY_TERMS)) return "Supplies";
  for (const [format, terms] of Object.entries(FORMAT_TERMS)) {
    if (includesAny(haystack, terms)) return format;
  }
  if (category === "Bioregulators") return "Bioregulators";
  return DEFAULT_FORMAT;
}

function inferQuantity(raw, family, format) {
  const source = compact([raw.listing, raw.product, raw.sku].filter(Boolean).join(" "));
  const normalizedFamily = compact(family);
  let remaining = source;
  if (normalizedFamily) {
    const familyRegex = new RegExp(escapeRegex(normalizedFamily).replace(/\\ /g, "\\s+") + "\\s*[-:/|]?\\s*", "i");
    remaining = source.replace(familyRegex, " ");
  }
  const doseMatches = [...remaining.matchAll(/\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu|units?)/gi)].map(match => compact(match[0]).replace(/\s+/g, ""));
  const packMatches = [...remaining.matchAll(/\d+\s*(?:pack|pk|vials?|caps?|capsules?|tablets?|tabs?|ct|count)/gi)].map(match => compact(match[0]).replace(/\s+/g, " "));
  const doses = unique(doseMatches.map(value => value.toLowerCase()));
  const packs = unique(packMatches.map(value => value.toLowerCase()));
  const parts = [];
  if (doses.length) parts.push(doses.join(" / "));
  if (packs.length) parts.push(packs.join(" / "));
  let label = parts.length ? parts.join(" / ") : "Standard listing";
  if (!doses.length && !packs.length && /\bto\b/i.test(compact(raw.price))) label = "Choose size on vendor site";
  if (!doses.length && !packs.length && format === "Supplies") {
    const supplyLabel = cleanFallbackName(raw.listing || raw.product || "Standard listing");
    if (supplyLabel && supplyLabel !== family) label = supplyLabel;
  }
  const first = doses[0] || packs[0] || "999999";
  const number = Number((first.match(/\d+(?:\.\d+)?/) || ["999999"])[0]);
  const unit = (first.match(/[a-z]+/) || [""])[0];
  const factor = unit === "mcg" ? 0.001 : unit === "g" ? 1000 : unit === "iu" || unit === "units" ? 100000 : 1;
  return { id: slug(label), label, sort: Number.isFinite(number) ? number * factor : 999999 };
}

function vendorMeta(vendor) {
  return VENDOR_CONFIG[vendor] || {
    id: slug(vendor || "unknown-vendor"),
    discount_percent: 0,
    affiliate_url: "#",
    logo: ""
  };
}

function isExcluded(raw) {
  const haystack = normalized([raw.product, raw.listing, raw.sku, raw.category, raw.raw_category].filter(Boolean).join(" "));
  return (overridePayload.exclude_terms || []).some(term => haystack.includes(normalized(term)));
}

export function normalizeOffer(raw = {}, options = {}) {
  if (isExcluded(raw)) return null;
  const source = { ...raw };
  const vendor = compact(source.company || source.vendor || "Unknown vendor");
  const meta = vendorMeta(vendor);
  const canonical = findCanonicalRecord(source);
  const category = canonical.category && canonical.category !== DEFAULT_CATEGORY ? canonical.category : inferCategory(canonical.name, source);
  const format = inferFormat(source, category, canonical.name);
  const quantity = inferQuantity(source, canonical.name, format);
  const listedPrices = priceNumbers(source.sale_price || source.price);
  const discount = Number(meta.discount_percent || 0);
  const effectivePrices = listedPrices.map(value => value * (1 - discount / 100));
  const listedMin = listedPrices.length ? Math.min(...listedPrices) : Number.POSITIVE_INFINITY;
  const effectiveMin = effectivePrices.length ? Math.min(...effectivePrices) : listedMin;
  const sourceLayer = compact(options.source_layer || source.source_layer || source.source || "unknown-source");
  return {
    vendor_id: meta.id,
    vendor_name: vendor,
    vendor_logo: meta.logo || "",
    product_id: canonical.id,
    product_name: canonical.name,
    category,
    format,
    quantity_id: quantity.id,
    quantity_label: quantity.label,
    quantity_sort: quantity.sort,
    regular_price_label: formatPriceRange(listedPrices),
    effective_price_label: discount > 0 && listedPrices.length ? formatPriceRange(effectivePrices) : formatPriceRange(listedPrices),
    regular_price_min: Number.isFinite(listedMin) ? roundMoney(listedMin) : null,
    effective_price_min: Number.isFinite(effectiveMin) ? roundMoney(effectiveMin) : null,
    discount_percent: discount,
    coupon_code: discount > 0 ? COUPON_CODE : "",
    in_stock: source.in_stock !== false,
    affiliate_url: compact(source.url || meta.affiliate_url || "#"),
    raw_product: compact(source.raw_product || source.product || source.name || source.title || source.listing || "Untitled product"),
    raw_listing: compact(source.raw_listing || source.listing || source.product || source.name || source.title || "Untitled product"),
    sku: compact(source.sku || ""),
    source_layer: sourceLayer,
    mapped: canonical.mapped !== false,
    mapping: canonical.mapping,
    source_product_id: compact(source.source_product_id || ""),
    source_variation_id: compact(source.source_variation_id || ""),
    ingestion_warning: compact(source.ingestion_warning || "")
  };
}

function rawOfferKey(offer) {
  return normalized([
    offer.vendor_name, offer.product_id, offer.format, offer.quantity_id, offer.raw_listing,
    offer.sku, offer.regular_price_label, offer.affiliate_url
  ].join(" || "));
}
function bestOffer(existing, candidate) {
  if (!existing) return candidate;
  const a = existing.effective_price_min == null ? Number.POSITIVE_INFINITY : existing.effective_price_min;
  const b = candidate.effective_price_min == null ? Number.POSITIVE_INFINITY : candidate.effective_price_min;
  if (b < a) return { ...candidate, alternate_offer_count: Number(existing.alternate_offer_count || 0) + 1 };
  return { ...existing, alternate_offer_count: Number(existing.alternate_offer_count || 0) + 1 };
}

function stripInternalOffer(offer) {
  return { ...offer };
}

export function buildCatalog(rawRows = [], options = {}) {
  const normalizedRows = [];
  const seen = new Set();
  const excludedRows = [];
  for (const row of rawRows || []) {
    const offer = normalizeOffer(row, { source_layer: row.source_layer || options.source_layer });
    if (!offer) {
      excludedRows.push(row);
      continue;
    }
    const key = rawOfferKey(offer);
    if (seen.has(key)) continue;
    seen.add(key);
    normalizedRows.push(offer);
  }

  const cards = new Map();
  for (const offer of normalizedRows) {
    const cardKey = `${offer.product_id}::${slug(offer.format)}`;
    if (!cards.has(cardKey)) {
      cards.set(cardKey, {
        id: cardKey,
        product_id: offer.product_id,
        name: offer.product_name,
        category: offer.category,
        format: offer.format,
        mapped: true,
        variants: new Map(),
        vendorNames: new Set(),
        offer_count: 0
      });
    }
    const card = cards.get(cardKey);
    card.offer_count += 1;
    card.vendorNames.add(offer.vendor_name);
    if (!offer.mapped) card.mapped = false;
    if (card.category === DEFAULT_CATEGORY && offer.category !== DEFAULT_CATEGORY) card.category = offer.category;
    if (!card.variants.has(offer.quantity_id)) {
      card.variants.set(offer.quantity_id, {
        id: offer.quantity_id,
        label: offer.quantity_label,
        sort: offer.quantity_sort,
        suppliers: new Map(),
        all_offer_count: 0
      });
    }
    const variant = card.variants.get(offer.quantity_id);
    variant.all_offer_count += 1;
    variant.suppliers.set(offer.vendor_id, bestOffer(variant.suppliers.get(offer.vendor_id), stripInternalOffer(offer)));
  }

  const productCards = [...cards.values()].map(card => {
    const variants = [...card.variants.values()].map(variant => {
      const suppliers = [...variant.suppliers.values()].sort((a, b) => {
        const pa = a.effective_price_min == null ? Number.POSITIVE_INFINITY : a.effective_price_min;
        const pb = b.effective_price_min == null ? Number.POSITIVE_INFINITY : b.effective_price_min;
        return pa - pb || a.vendor_name.localeCompare(b.vendor_name);
      });
      return {
        id: variant.id,
        label: variant.label,
        sort: variant.sort,
        supplier_count: suppliers.length,
        all_offer_count: variant.all_offer_count,
        suppliers
      };
    }).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
    const allSuppliers = variants.flatMap(variant => variant.suppliers);
    const priced = allSuppliers.map(offer => offer.effective_price_min).filter(value => value != null);
    return {
      id: card.id,
      product_id: card.product_id,
      name: card.name,
      category: card.category,
      format: card.format,
      mapped: card.mapped,
      supplier_count: card.vendorNames.size,
      offer_count: card.offer_count,
      lowest_effective_price: priced.length ? Math.min(...priced) : null,
      variants
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.format.localeCompare(b.format));

  const unmapped = normalizedRows.filter(offer => !offer.mapped).map(offer => ({
    vendor: offer.vendor_name,
    raw_product: offer.raw_product,
    raw_listing: offer.raw_listing,
    sku: offer.sku,
    grouped_as: offer.product_name,
    category: offer.category,
    format: offer.format,
    quantity: offer.quantity_label
  })).sort((a, b) => a.vendor.localeCompare(b.vendor) || a.raw_product.localeCompare(b.raw_product));

  const vendors = {};
  const layers = {};
  for (const offer of normalizedRows) {
    vendors[offer.vendor_name] = (vendors[offer.vendor_name] || 0) + 1;
    layers[offer.source_layer] = (layers[offer.source_layer] || 0) + 1;
  }

  return {
    schema_version: "catalog-v3",
    engine_version: ENGINE_VERSION,
    generated_at: new Date().toISOString(),
    coupon_code: COUPON_CODE,
    product_card_count: productCards.length,
    normalized_offer_count: normalizedRows.length,
    visible_unmapped_count: unmapped.length,
    excluded_count: excludedRows.length,
    silent_drop_count: 0,
    vendors_loaded: Object.keys(vendors).length,
    products: productCards,
    diagnostics: {
      engine_version: ENGINE_VERSION,
      generated_at: new Date().toISOString(),
      product_card_count: productCards.length,
      normalized_offer_count: normalizedRows.length,
      visible_unmapped_count: unmapped.length,
      excluded_count: excludedRows.length,
      silent_drop_count: 0,
      vendors,
      layers,
      vendor_status: options.vendor_status || {},
      unmapped_products: unmapped,
      warnings: options.warnings || []
    }
  };
}

export function publicSnapshot(snapshot = {}) {
  const { raw_offers_by_vendor, ...publicData } = snapshot || {};
  return publicData;
}
