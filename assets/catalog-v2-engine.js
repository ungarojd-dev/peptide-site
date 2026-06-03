(function (global) {
  "use strict";

  const VERSION = "2.0.0-preview";
  const GLP_CATEGORY = "GLP-1 & Incretin";
  const VENDOR_PREFIX = /^(glacier\s+aminos?|ion\s+peptide|southern\s+aminos?|labsourced\s+peptides?|mile\s+high\s+(?:compounds?|peptides?)?|solyn\s+labs?|oneday\s+compounds?|glow\s+aminos?|flawless\s+compounds?|instant\s+peptides?)\s*[-:|]?\s*/i;
  const SIZE_PATTERN = /(?:^|\s|[-:,(])\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu|units?|caps?|capsules?|tablets?|vials?|ct|pack)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu|units?))?/gi;
  const SUPPLY_WORDS = ["bacteriostatic", "bac water", "sterile water", "reconstitution water", "acetic acid", "syringe", "needle", "pen needle", "storage case", "travel case", "vial cap", "vial cover", "shipping protection", "gift card", "cartridge", "starter kit"];

  let records = [];
  let aliasEntries = [];
  let recordByName = new Map();

  function str(value) { return value == null ? "" : String(value); }
  function compact(value) { return str(value).replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim(); }
  function lower(value) { return compact(value).toLowerCase(); }
  function normalized(value) {
    return lower(value)
      .replace(/&/g, " and ")
      .replace(/\+/g, " plus ")
      .replace(/[^a-z0-9§]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function slug(value) { return normalized(value).replace(/\s+/g, "-") || "untitled-product"; }
  function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
  function includesAny(text, terms) { return terms.some(term => text.includes(term)); }
  function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function phraseRegex(alias) {
    const a = normalized(alias);
    const body = escapeRegex(a).replace(/\\ /g, "[\\s\\-_/+]+");
    return new RegExp("(?:^|[^a-z0-9])" + body + "(?:$|[^a-z0-9])", "i");
  }
  function hasPhrase(raw, phrase) { return phraseRegex(phrase).test(normalized(raw)); }
  function tokenCount(value) { return normalized(value).split(/\s+/).filter(Boolean).length; }

  function initCatalog(payload) {
    records = Array.isArray(payload && payload.products) ? payload.products : [];
    recordByName = new Map(records.map(record => [record.name, record]));
    aliasEntries = [];
    records.forEach(record => {
      unique([record.name, ...(record.aliases || [])]).forEach(alias => {
        const norm = normalized(alias);
        if (!norm) return;
        aliasEntries.push({ record, alias, norm, tokens: tokenCount(norm), length: norm.length, regex: phraseRegex(norm) });
      });
    });
    aliasEntries.sort((a, b) => b.tokens - a.tokens || b.length - a.length);
  }

  const COMPONENTS = [
    ["Semaglutide", ["semaglutide", "sema", "pep-sm", "peptide sm", "gla-1 sm", "glp-1 sm", "ion-1s", "sa-1s"]],
    ["Tirzepatide", ["tirzepatide", "tirz", "pep-trz", "pep-tz", "peptide trz", "peptide tz", "gla-2 trz", "glp-t2", "ion-2t", "sa-2t"]],
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
  const COMPONENT_ORDER = COMPONENTS.map(item => item[0]);

  function detectComponents(raw) {
    const text = " " + normalized(raw) + " ";
    const found = [];
    COMPONENTS.forEach(([name, aliases]) => {
      if (aliases.some(alias => phraseRegex(alias).test(text))) found.push(name);
    });
    return unique(found);
  }
  function isBlendText(raw, components) {
    const text = lower(raw);
    return components.length > 1 && (/\bblend\b|\bwolverine\b|\/|\+|\band\b|,/.test(text));
  }
  function canonicalBlend(raw) {
    const components = detectComponents(raw);
    if (!isBlendText(raw, components)) return "";
    const ordered = COMPONENT_ORDER.filter(component => components.includes(component));
    return ordered.join(" + ") + " Blend";
  }

  function cleanFallbackName(raw) {
    let value = compact(raw || "Untitled API Product").replace(VENDOR_PREFIX, "");
    value = value
      .replace(/\b(?:research\s+)?peptide\s+vial\b/ig, "")
      .replace(/\b(?:vial|capsules?|tablets?|spray|topical|liquid)\b\s*$/ig, "")
      .replace(SIZE_PATTERN, " ")
      .replace(/\b(?:or|pack|total)\b\s*$/i, "")
      .replace(/[|]+\s*$/g, "")
      .replace(/\(\s*\)/g, "")
      .replace(/\s+or\s*$/i, "")
      .replace(/\s+/g, " ")
      .replace(/\s*[-:/]\s*$/g, "")
      .trim();
    return value || compact(raw) || "Untitled API Product";
  }

  function canonicalRecord(raw) {
    const text = [raw.product, raw.listing, raw.sku].filter(Boolean).join(" ");
    const blend = canonicalBlend(text);
    if (blend) return { id: slug(blend), name: blend, category: inferCategory(blend, raw), mapped: true, mapping: "blend-components" };
    const norm = normalized(text);
    for (const entry of aliasEntries) {
      // Short aliases need exact-token matching. Longer aliases can appear inside the source listing.
      if (entry.regex.test(norm)) return { ...entry.record, mapped: true, mapping: "catalog-alias:" + entry.alias };
    }
    const fallback = cleanFallbackName(raw.product || raw.listing || "Untitled API Product");
    return { id: slug(fallback), name: fallback, category: inferCategory(fallback, raw), mapped: false, mapping: "visible-unmapped" };
  }

  function inferCategory(family, raw) {
    const existing = compact(raw && (raw.raw_category || raw.category || raw.source_category || ""));
    const text = lower([family, raw && raw.product, raw && raw.listing, raw && raw.sku, existing].filter(Boolean).join(" "));
    const components = detectComponents(text);
    if (components.some(name => ["Semaglutide", "Tirzepatide", "Retatrutide", "Cagrilintide"].includes(name)) || includesAny(text, ["glp", "mazdutide", "survodutide", "liraglutide", "tesofensine", "orforglipron"])) return GLP_CATEGORY;
    if (includesAny(text, SUPPLY_WORDS)) return "Supplies";
    if (includesAny(text, ["bpc", "tb-500", "tb500", "kpv", "ll-37", "wolverine", "repair", "recovery", "ara-290"])) return "Repair & Recovery";
    if (includesAny(text, ["cjc", "ipamorelin", "sermorelin", "tesamorelin", "ghrp", "hexarelin", "igf", "hgh", "growth hormone", "modified grf"])) return "Growth Hormone Research";
    if (includesAny(text, ["semax", "selank", "dihexa", "cerebrolysin", "vip", "dsip", "nootropic", "cognitive", "p21", "pe-22"])) return "Cognitive & Nootropic";
    if (includesAny(text, ["pt-141", "melanotan", "mt-1", "mt-2", "kisspeptin", "oxytocin", "tanning", "sexual health"])) return "Skin, Tanning & Sexual Health";
    if (includesAny(text, ["pinealon", "vilon", "vesugen", "pancragen", "bronchogen", "cardiogen", "ovagen", "livagen", "thymagen", "thymalin", "thymulin", "cartalax", "bioregulator"])) return "Bioregulators";
    if (includesAny(text, ["mots", "ss-31", "s-31-s", "§-31", "5-amino", "aod", "slu-pp", "glutathione", "lipo-c", "aicar", "adipotide", "metabolic", "mitochondrial"])) return "Metabolic & Mitochondrial";
    if (includesAny(text, ["nad", "ghk", "ahk", "snap-8", "foxo4", "humanin", "epitalon", "thymosin alpha", "longevity", "cellular"])) return "Longevity & Cellular Health";
    const legacy = {
      "GLP / Weight Loss": GLP_CATEGORY,
      "Recovery & Healing": "Repair & Recovery",
      "Longevity & Anti-Aging": "Longevity & Cellular Health",
      "Growth Hormone": "Growth Hormone Research",
      "Sexual Health & Tanning": "Skin, Tanning & Sexual Health",
      "Metabolic & Energy": "Metabolic & Mitochondrial",
      "Other": "Other"
    };
    return legacy[existing] || existing || "Other";
  }

  function inferFormat(raw, category, family) {
    const text = lower([raw.product, raw.listing, raw.sku, raw.format, family].filter(Boolean).join(" "));
    if (category === "Supplies" || includesAny(text, SUPPLY_WORDS)) return "Supplies";
    if (includesAny(text, ["capsule", "capsules", "tablet", "tablets", "troche", "oral"])) return "Capsules";
    if (includesAny(text, ["nasal", "spray", "intranasal"])) return "Nasal Sprays";
    if (includesAny(text, ["topical", "cream", "serum", "lotion"])) return "Topicals";
    if (includesAny(text, ["liquid", "drops", "solution"])) return "Liquids";
    if (includesAny(text, ["amino", "l-carnitine"])) return "Aminos";
    if (category === "Bioregulators") return "Bioregulators";
    return compact(raw.format) || "Peptides";
  }

  function priceNumber(value) {
    const numbers = str(value).match(/\d+(?:\.\d+)?/g);
    if (!numbers || !numbers.length) return Number.POSITIVE_INFINITY;
    return Math.min(...numbers.map(Number).filter(Number.isFinite));
  }
  function displayPrice(raw) {
    const selected = raw.sale_price || raw.price || "Contact for price";
    if (typeof selected === "number") return "$" + selected.toFixed(2);
    const value = compact(selected);
    return value || "Contact for price";
  }
  function extractVariation(raw, family) {
    const listing = compact(raw.listing || raw.product || "");
    const familyRegex = new RegExp("^" + escapeRegex(family).replace(/\\ /g, "\\s+") + "\\s*(?:[-:/|]|\\u2013|\\u2014)?\\s*", "i");
    let remaining = listing.replace(familyRegex, "").trim();
    const matches = listing.match(/\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu|units?)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu|units?))?/gi);
    if (matches && matches.length) return unique(matches.map(compact)).join(" / ");
    if (remaining && remaining !== listing && remaining.length < 60) return remaining;
    return "Standard listing";
  }

  function normalizeOffer(raw, meta) {
    const source = raw || {};
    const rec = canonicalRecord(source);
    const category = rec.category && rec.category !== "Other" ? rec.category : inferCategory(rec.name, source);
    const offer = {
      ...source,
      company: compact(source.company || source.vendor || "Unknown vendor"),
      product: compact(source.product || source.name || source.title || source.listing || "Untitled API Product"),
      listing: compact(source.listing || source.product || source.name || source.title || "Untitled API Product"),
      canonical_id: rec.id,
      canonical_name: rec.name,
      canonical_category: category,
      mapped: rec.mapped,
      mapping: rec.mapping,
      format: inferFormat(source, category, rec.name),
      display_price: displayPrice(source),
      price_number: priceNumber(source.sale_price || source.price),
      variation: extractVariation(source, rec.name),
      source_layer: meta && meta.layer ? meta.layer : (source.source || "snapshot"),
      raw_product: compact(source.raw_product || source.product || source.name || source.title || ""),
      raw_listing: compact(source.raw_listing || source.listing || source.product || "")
    };
    return offer;
  }
  function offerKey(offer) {
    return normalized([offer.company, offer.canonical_name, offer.listing, offer.sku, offer.display_price, offer.variation].join("||"));
  }
  function vendorFamilyKey(offer) { return normalized([offer.company, offer.canonical_name].join("||")); }
  function dedupe(rows) {
    const out = [], seen = new Set();
    (rows || []).forEach(row => {
      const key = offerKey(row);
      if (seen.has(key)) return;
      seen.add(key); out.push(row);
    });
    return out;
  }

  function normalizeRows(rows, meta) { return (rows || []).map(row => normalizeOffer(row, meta)); }
  function mergeFallbackAndLive(fallbackRaw, liveRaw) {
    const fallback = normalizeRows(fallbackRaw, { layer: "static-fallback" });
    const live = normalizeRows(liveRaw, { layer: "live-snapshot" });
    if (!live.length) return dedupe(fallback);
    const liveFamilies = new Set(live.map(vendorFamilyKey));
    const retainedFallback = fallback.filter(offer => !liveFamilies.has(vendorFamilyKey(offer)));
    return dedupe([...retainedFallback, ...live]);
  }
  function mergeEnrichment(baseRows, enrichmentRaw) {
    const base = dedupe(baseRows || []);
    const enriched = normalizeRows(enrichmentRaw, { layer: "optional-enrichment" });
    if (!enriched.length) return base;
    const enrichedFamilies = new Set(enriched.map(vendorFamilyKey));
    const retained = base.filter(offer => !enrichedFamilies.has(vendorFamilyKey(offer)));
    return dedupe([...retained, ...enriched]);
  }

  function groupOffers(rows) {
    const groups = new Map();
    dedupe(rows).forEach(offer => {
      const key = offer.canonical_id;
      if (!groups.has(key)) groups.set(key, {
        id: key,
        name: offer.canonical_name,
        category: offer.canonical_category,
        mapped: true,
        offers: [],
        formats: new Set(),
        vendors: new Set()
      });
      const group = groups.get(key);
      group.offers.push(offer);
      group.formats.add(offer.format);
      group.vendors.add(offer.company);
      if (!offer.mapped) group.mapped = false;
      if (group.category === "Other" && offer.canonical_category !== "Other") group.category = offer.canonical_category;
    });
    return [...groups.values()].map(group => ({
      ...group,
      formats: [...group.formats].sort(),
      vendors: [...group.vendors].sort(),
      offers: group.offers.sort((a, b) => a.price_number - b.price_number || a.company.localeCompare(b.company))
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  function diagnostics(rows, groups, extra) {
    const offers = dedupe(rows || []);
    const unmapped = offers.filter(offer => !offer.mapped);
    const layers = {};
    const vendors = {};
    offers.forEach(offer => {
      layers[offer.source_layer] = (layers[offer.source_layer] || 0) + 1;
      vendors[offer.company] = (vendors[offer.company] || 0) + 1;
    });
    return {
      engine_version: VERSION,
      generated_at: new Date().toISOString(),
      total_offers: offers.length,
      canonical_cards: (groups || []).length,
      mapped_offers: offers.length - unmapped.length,
      visible_unmapped_offers: unmapped.length,
      silent_drops: 0,
      layers,
      vendors,
      visible_unmapped: unmapped.map(offer => ({ company: offer.company, product: offer.product, listing: offer.listing, grouped_as: offer.canonical_name, category: offer.canonical_category })).sort((a,b)=>a.company.localeCompare(b.company)||a.product.localeCompare(b.product)),
      ...(extra || {})
    };
  }

  global.CatalogV2 = { VERSION, initCatalog, normalizeOffer, normalizeRows, mergeFallbackAndLive, mergeEnrichment, groupOffers, diagnostics, priceNumber, cleanFallbackName, canonicalBlend };
})(window);
