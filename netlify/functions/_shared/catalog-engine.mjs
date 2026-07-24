import catalogPayload from "../../../data/catalog-products.json" with { type: "json" };
import overridePayload from "../../../data/catalog-overrides.json" with { type: "json" };
import vendorPayload from "../../../data/vendor-config.json" with { type: "json" };
import promotionPayload from "../../../data/promotions.json" with { type: "json" };

export const ENGINE_VERSION = "1.1.0-merged-formats";
export const COUPON_CODE = vendorPayload.coupon_code || "SAMMYC";
export const VENDOR_CONFIG = vendorPayload.vendors || {};
export const PROMOTIONS = promotionPayload.promotions || [];

const GLP_CATEGORY = "GLP-1 & Incretin";
const DEFAULT_CATEGORY = "Other";
const DEFAULT_FORMAT = "Vials";
const SUPPLY_TERMS = [
  "bacteriostatic", "bac water", "sterile water", "reconstitution water", "acetic acid",
  "syringe", "needle", "pen needle", "vial cap", "vial cover", "vial case", "case slots", "storage case", "travel case",
  "cartridge", "starter kit", "supplies", "supply", "reconstitution solution", "reusable peptide pen"
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
  "Other": "Other",
  // Stray vendor-supplied categories seen in live diagnostics. Without these
  // they pass straight through and create one-product filter entries.
  "Research Sprays": "Cognitive & Nootropic",
  "Singles": "Metabolic & Mitochondrial",
  "Encapsulated Products": "Cognitive & Nootropic",
  "Aminos & Oils / Exclusive Products": "Metabolic & Mitochondrial"
};

// Vendor feeds sometimes return HTML-encoded text. Left undecoded it renders
// literally, e.g. "Aminos &amp; Oils" showing the entity in the UI.
function decodeEntities(value) {
  return String(value == null ? "" : value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

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
    .replace(/[^a-z0-9§$]+/g, " ")
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

// Hardcoded critical aliases , always present regardless of JSON bundle state
const HARDCODED_FORCED_ALIASES = {
  // LabSourced Peptide-R/T/S naming
  "peptide r": "retatrutide", "peptide-r": "retatrutide",
  "peptide t": "tirzepatide", "peptide-t": "tirzepatide",
  "peptide s": "semaglutide", "peptide-s": "semaglutide",
  // Ion shortcodes
  "tesa": "tesamorelin", "tesa ipamo": "ipamorelin-plus-tesamorelin-blend",
  "cag": "cagrilintide", "sermo": "sermorelin", "ipamo": "ipamorelin",
  "bw h brand": "bacteriostatic-water",
  "mlt i": "melanotan-i", "mlt ii": "melanotan-ii", "mlt 1": "melanotan-i", "mlt 2": "melanotan-ii",
  "oxt 10": "oxytocin", "oxt10": "oxytocin",
  // Southern SKU patterns
  "us hgh176 5": "hgh-fragment-176-191",
  "us oxy 10": "oxytocin", "oxn 010 mh": "oxytocin",
  // FOX04 zero typo
  "fox04 dri": "foxo4-dri", "fox04": "foxo4-dri",
  // § symbol for SS-31
  "§ 31": "ss-31",
  // Glacier patterns
  "s 31 s": "ss-31", "mtp10ga": "ss-31",
  "bpc tb 500 wolverine": "bpc-157-plus-tb-500-blend",
  "gla 1 sm": "semaglutide", "gla 1 sm 15mg": "semaglutide",
  "gla 2 trz": "tirzepatide", "gla 3 rt": "retatrutide",
  "gla 2 5 trz rt": "retatrutide-and-tirzepatide-blend",
  "gla 2.5 trz rt": "retatrutide-and-tirzepatide-blend",
  "gla 2 5 trz rt 20mg": "retatrutide-and-tirzepatide-blend",
  "gla 2.5 trz rt 20mg": "retatrutide-and-tirzepatide-blend",
  "gla 3 rt cagri": "retatrutide-and-cagrilintide-blend",
  "gla 3 rt cagri 20mg 4mg": "retatrutide-and-cagrilintide-blend",
  // Cargilintide typo
  "cargilintide": "cagrilintide", "cargrilintide": "cagrilintide",
  "cargilintide 10mg": "cagrilintide",
  // Glutathione typo
  "gluthathione": "glutathione", "sl glt1500": "glutathione",
  // Methylene blue typo
  "methyline blue": "methylene-blue", "methyline blue capsules": "methylene-blue",
  // Bioedge Research Labs branded naming
  "edge r3": "retatrutide", "edge r 3": "retatrutide",
  "edge t2": "tirzepatide", "edge t 2": "tirzepatide",
  // Bioedge Sermorlin typo (missing e)
  "sermorlin": "sermorelin",
  // Live-diagnostics audit fixes (2026-06-29)
  // Coffee and Peppers uses $$ in place of SS for SS-31
  "$$-31": "ss-31",
  // Coffee and Peppers omits the 1MQ suffix on 5-Amino-1MQ
  "5-amino": "5-amino-1mq",
  // Coffee and Peppers lists AOD-9604 as plain AOD
  "aod": "aod-9604",
  // Solyn Labs storefront typos
  "selenk": "selank",
  "semex": "semax",
};

const forcedAliases = Object.entries({ ...(overridePayload.forced_aliases || {}), ...HARDCODED_FORCED_ALIASES })
  .map(([alias, id]) => ({ alias, id, norm: normalized(alias), regex: phraseRegex(alias) }))
  .sort((a, b) => b.norm.split(/\s+/).length - a.norm.split(/\s+/).length || b.norm.length - a.norm.length);

const BLEND_COMPONENTS = [
  ["Semaglutide", ["semaglutide", "sema", "pep-sm", "peptide sm", "gla-1 sm", "ion-1s", "sa-1s", "fg1-s", "fg1 s"]],
  ["Tirzepatide", ["tirzepatide", "tirz", "trz", "pep-trz", "pep-tz", "peptide trz", "peptide tz", "gla-2 trz", "gla-2.5 trz", "gla 2 5 trz", "glp-t2", "ion-2t", "sa-2t", "fg2-t", "fg2 t"]],
  ["Retatrutide", ["retatrutide", "reta", "pep-rt", "peptide rt", "gla-3 rt", "gla-2.5 trz/rt", "gla 2 5 trz rt", "glp-r3", "ion-3r", "sa-3r", "oc-3rt", "fg3-r", "fg3 r", "glp-3 rt", "glp-3rt"]],
  ["Cagrilintide", ["cagrilintide", "cagrilinitide", "cagri", "pep-cag", "sa-4c", "cag"]],
  ["BPC-157", ["bpc-157", "bpc157"]],
  ["TB-500", ["tb-500", "tb500", "tb-4", "tb4"]],
  ["GHK-Cu", ["ghk-cu", "ghk cu", "ghkcu"]],
  ["KPV", ["kpv"]],
  ["CJC-1295", ["cjc-1295", "cjc 1295"]],
  ["Ipamorelin", ["ipamorelin", "ipamo", "ipa"]],
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
  const componentKey = components.map(component => slug(component)).sort().join("+");
  const knownBlendIds = {
    "bpc-157+tb-500": "bpc-157-plus-tb-500-blend",
    "cagrilintide+retatrutide": "retatrutide-and-cagrilintide-blend",
    "cagrilintide+semaglutide": "semaglutide-and-cagrilintide-blend",
    "cagrilintide+tirzepatide": "tirzepatide-and-cagrilintide-blend",
    "retatrutide+tirzepatide": "retatrutide-and-tirzepatide-blend",
    "ipamorelin+tesamorelin": "ipamorelin-plus-tesamorelin-blend",
    "semax+selank": "semax-plus-selank-blend",
    "ghk-cu+kpv": "ghk-cu-plus-kpv-blend"
  };
  const knownRecord = recordById.get(knownBlendIds[componentKey]);
  if (knownRecord) return { ...knownRecord, mapped: true, mapping: `blend-components:${componentKey}` };
  const name = `${components.join(" + ")} Blend`;
  const id = slug(name);
  return { id, name, category: inferCategory(name, {}), aliases: [], dynamic: true };
}

function dedupeLeadingPhrase(str) {
  const words = str.split(" ");
  for (let n = Math.floor(words.length / 2); n >= 1; n--) {
    const prefix = words.slice(0, n).join(" ");
    const after = words.slice(n).join(" ");
    if (after.toLowerCase().startsWith(prefix.toLowerCase())) {
      return (prefix + " " + after.slice(prefix.length).trim()).replace(/\s+/g, " ").trim();
    }
  }
  return str;
}

function cleanFallbackName(value) {
  let cleaned = compact(value || "Untitled product")
    .replace(/^(glacier\s+aminos?|ion\s+peptide|southern\s+aminos?|labsourced\s+peptides?|mile\s+high\s+(?:compounds?|peptides?)?|solyn\s+labs?|oneday\s+compounds?|glow\s+aminos?|flawless\s+compounds?|instant\s+peptides?)\s*[-:|]?\s*/i, "")
    .replace(/\b(?:research\s+)?peptide\s+vial\b/ig, "")
    .replace(/\b(?:vial|capsules?|tablets?|sprays?|topicals?|liquids?)\b\s*$/ig, "")
    .replace(/(?:^|\s|[-:,(])\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu|units?|caps?|capsules?|tablets?|vials?|ct|pack)\.?\)?(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu|units?))?/gi, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*[-:/|]\s*$/g, "")
    .trim();
  cleaned = dedupeLeadingPhrase(cleaned);
  cleaned = cleaned
    .replace(/\s+[A-Z]{2,3}-[A-Z0-9]+-[A-Z0-9]+$/g, "")
    .replace(/\s+[A-Z]{2,3}-[A-Z]{1,3}\d+\w*$/g, "")
    .replace(/\s+[a-z]{2,}\d*[a-z]{2,}$/g, "")
    .replace(/\s+[a-z]{4,}$/g, m => /^(blend|cream|serum|spray|nasal|oral|raw|plus|with|and|for)$/.test(m.trim()) ? m : "")
    .replace(/\s+/g, " ")
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

// Some vendors mislabel real research peptides as "Supplies" (e.g. a 1g raw of a
// cosmetic peptide). These name-based overrides win over the vendor's category so
// the compound lands in the right place. Keyed by a lowercase substring of the name.
const FORCED_CATEGORY = [
  ["acetyl hexapeptide", "Skin, Tanning & Sexual Health"],
  ["argireline", "Skin, Tanning & Sexual Health"],
  ["syn ake", "Skin, Tanning & Sexual Health"],
  ["syn ake", "Skin, Tanning & Sexual Health"],
  ["hcg", "Growth Hormone Research"],
  ["human chorionic", "Growth Hormone Research"],

  // Cognitive / nootropics (racetams, ampakines, and related research chemicals)
  ["aniracetam", "Cognitive & Nootropic"],
  ["oxiracetam", "Cognitive & Nootropic"],
  ["phenylpiracetam", "Cognitive & Nootropic"],
  ["fasoracetam", "Cognitive & Nootropic"],
  ["noopept", "Cognitive & Nootropic"],
  ["sunifiram", "Cognitive & Nootropic"],
  ["sunifram", "Cognitive & Nootropic"],
  ["prl 8 53", "Cognitive & Nootropic"],
  ["prl 8 53", "Cognitive & Nootropic"],
  ["fladrafinil", "Cognitive & Nootropic"],
  ["bromantane", "Cognitive & Nootropic"],
  ["phenibut", "Cognitive & Nootropic"],
  ["tak 653", "Cognitive & Nootropic"],
  ["kw 6356", "Cognitive & Nootropic"],
  ["9 me bc", "Cognitive & Nootropic"],
  ["9 methyl", "Cognitive & Nootropic"],
  ["mexidol", "Cognitive & Nootropic"],
  ["emoxypine", "Cognitive & Nootropic"],
  ["bemethyl", "Cognitive & Nootropic"],
  ["j 147", "Cognitive & Nootropic"],
  ["l thp", "Cognitive & Nootropic"],
  ["ipam (indole", "Cognitive & Nootropic"],
  ["indolepropionamide", "Cognitive & Nootropic"],
  ["neuro spark", "Cognitive & Nootropic"],
  ["focusx", "Cognitive & Nootropic"],
  ["proviper", "Cognitive & Nootropic"],

  // Metabolic / mitochondrial (SARMs, mitochondrial and metabolic research chems)
  ["cardarine", "Metabolic & Mitochondrial"],
  ["gw 501516", "Metabolic & Mitochondrial"],
  ["ostarine", "Metabolic & Mitochondrial"],
  ["mk 2866", "Metabolic & Mitochondrial"],
  ["yk 11", "Metabolic & Mitochondrial"],
  ["sr 9009", "Metabolic & Mitochondrial"],
  ["sr9009", "Metabolic & Mitochondrial"],
  ["bam15", "Metabolic & Mitochondrial"],
  ["bam 15", "Metabolic & Mitochondrial"],
  ["mk677", "Metabolic & Mitochondrial"],
  ["mk 677", "Metabolic & Mitochondrial"],
  ["ibutamoren", "Metabolic & Mitochondrial"],
  ["mk777", "Metabolic & Mitochondrial"],
  ["slu pp", "Metabolic & Mitochondrial"],
  ["o 304", "Metabolic & Mitochondrial"],
  ["atx 304", "Metabolic & Mitochondrial"],
  ["gc 1", "Metabolic & Mitochondrial"],
  ["sobetirome", "Metabolic & Mitochondrial"],
  ["meldonium", "Metabolic & Mitochondrial"],
  ["itpp", "Metabolic & Mitochondrial"],
  ["shredx", "Metabolic & Mitochondrial"],
  ["metabolic fire", "Metabolic & Mitochondrial"],
  ["coq10", "Metabolic & Mitochondrial"],
  ["nmn", "Metabolic & Mitochondrial"],
  ["nicotinamide mononucleotide", "Metabolic & Mitochondrial"],
  ["nad", "Metabolic & Mitochondrial"],

  // GLP-1 / incretin
  ["eloralintide", "GLP-1 & Incretin"],
  ["elora", "GLP-1 & Incretin"],
  ["exenatide", "GLP-1 & Incretin"],
  ["metatrutide", "GLP-1 & Incretin"],
  ["glp 4", "GLP-1 & Incretin"],
  ["amylin receptor", "GLP-1 & Incretin"],

  // Skin / dermal / sexual health
  ["minoxidil", "Skin, Tanning & Sexual Health"],
  ["ru58841", "Skin, Tanning & Sexual Health"],
  ["proglow", "Skin, Tanning & Sexual Health"],
  ["beautyx", "Skin, Tanning & Sexual Health"],
  ["tadalafil", "Skin, Tanning & Sexual Health"],
  ["mt ii", "Skin, Tanning & Sexual Health"],
  ["mt 2", "Skin, Tanning & Sexual Health"],
  ["melanotan", "Skin, Tanning & Sexual Health"],

  // Growth hormone / hormone research
  ["cjc with dac", "Growth Hormone Research"],
  ["cjc 1295", "Growth Hormone Research"],
  ["enclomiphene", "Growth Hormone Research"],
  ["mirabegron", "Growth Hormone Research"],
  ["clen", "Growth Hormone Research"],
  ["albuterol", "Growth Hormone Research"],
  ["tesamorlin", "Growth Hormone Research"],
  ["tesamorelin", "Growth Hormone Research"],

  // Repair & recovery
  ["recoverx", "Repair & Recovery"],
  ["recovery rush", "Repair & Recovery"],
  ["larazotide", "Repair & Recovery"],

  // Longevity / cellular
  ["lipox", "Longevity & Cellular Health"],
  ["nadh", "Longevity & Cellular Health"],
  ["biotinoyl", "Longevity & Cellular Health"],

  // Supplies (apparel, accessories, shipping, cases, hardware)
  ["hat", "Supplies"],
  ["apparel", "Supplies"],
  ["shirt", "Supplies"],
  ["grey on black", "Supplies"],
  ["carrying case", "Supplies"],
  ["cold pack", "Supplies"],
  ["shipping", "Supplies"],
  ["research accessor", "Supplies"],
  ["sodium chloride", "Supplies"],
  ["bac water", "Supplies"],
  ["bacteriostatic", "Supplies"],

  // Branded amino / performance blends (Coffee and Peppers, Disguised Alpha)
  ["body boost", "Metabolic & Mitochondrial"],
  ["energy lipo", "Metabolic & Mitochondrial"],
  ["helios extreme", "Metabolic & Mitochondrial"],
  ["performance peak", "Metabolic & Mitochondrial"],
  ["power blitz", "Metabolic & Mitochondrial"],
  ["power burn", "Metabolic & Mitochondrial"],
  ["pump xl", "Metabolic & Mitochondrial"],
  ["pump xxl", "Metabolic & Mitochondrial"],
  ["vitality vibe", "Metabolic & Mitochondrial"],
  ["drivex", "Metabolic & Mitochondrial"],
  ["provigorous", "Metabolic & Mitochondrial"],
  ["superx", "Metabolic & Mitochondrial"],
  ["hair skin nails", "Skin, Tanning & Sexual Health"],
  ["morning relax", "Cognitive & Nootropic"],
  ["sleep mix", "Cognitive & Nootropic"],
  ["pm matrix", "Cognitive & Nootropic"],
  ["dream catcher", "Cognitive & Nootropic"],
  ["tri immune", "Longevity & Cellular Health"],
  ["vitamin c", "Longevity & Cellular Health"],
  ["nac", "Longevity & Cellular Health"],
  ["n acetyl", "Longevity & Cellular Health"],
  ["amlexanox", "Metabolic & Mitochondrial"],
  ["mito", "Metabolic & Mitochondrial"],
  ["methylene blue", "Longevity & Cellular Health"],
  ["mthl blue", "Longevity & Cellular Health"],
  ["methyl blue", "Longevity & Cellular Health"],
  ["oxytocin", "Skin, Tanning & Sexual Health"],
  ["oxtcn", "Skin, Tanning & Sexual Health"],
  ["adalank", "Repair & Recovery"],
  ["dada", "Cognitive & Nootropic"],
  ["htc 31", "Repair & Recovery"],
  ["p 14", "Repair & Recovery"],

  // Bioregulator peptides (Khavinson-style short peptides)
  ["chonluten", "Bioregulators"],
  ["cortagen", "Bioregulators"],
  ["crystagen", "Bioregulators"],
  ["prostamax", "Bioregulators"],
  ["vesugen", "Bioregulators"],
  ["pinealon", "Bioregulators"],
  ["testagen", "Bioregulators"],
  ["vilon", "Bioregulators"],

  // Remaining named compounds and blends
  ["centella", "Skin, Tanning & Sexual Health"],
  ["gb 115", "Cognitive & Nootropic"],
  ["hmg", "Growth Hormone Research"],
  ["human menopausal", "Growth Hormone Research"],
  ["am shred", "Metabolic & Mitochondrial"],
  ["carfilflex", "Repair & Recovery"],
  ["vitamin b12", "Longevity & Cellular Health"],
  ["pnc 27", "Longevity & Cellular Health"],
  ["b12", "Longevity & Cellular Health"],
];

function inferCategory(family, raw) {
  const sourceCategory = decodeEntities(compact(raw.raw_category || raw.source_category || raw.category || ""));
  const nameHay = normalized([family, raw.product, raw.listing, raw.sku].filter(Boolean).join(" "));
  for (const [term, category] of FORCED_CATEGORY) {
    if (nameHay.includes(term)) return category;
  }
  const haystack = normalized([family, raw.product, raw.listing, raw.sku, sourceCategory].filter(Boolean).join(" "));
  if (includesAny(haystack, SUPPLY_TERMS)) return "Supplies";
  for (const [category, terms] of CATEGORY_TERMS) {
    if (includesAny(haystack, terms)) return category;
  }
  return LEGACY_CATEGORIES[sourceCategory] || decodeEntities(sourceCategory) || DEFAULT_CATEGORY;
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
    const familyRegex = new RegExp(escapeRegex(normalizedFamily).replace(/\\ /g, "\\s+") + "\\s*[-:/|]?\\s*", "ig");
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

function isPromotionActive(promotion, when = new Date()) {
  const now = when instanceof Date ? when.getTime() : new Date(when).getTime();
  if (!Number.isFinite(now)) return false;
  const starts = promotion.start_at ? new Date(promotion.start_at).getTime() : Number.NEGATIVE_INFINITY;
  const ends = promotion.end_at ? new Date(promotion.end_at).getTime() : Number.POSITIVE_INFINITY;
  return now >= starts && now <= ends;
}

// A promotion may limit itself to certain categories via scope_categories.
// Without this a GLP-only sale would reprice a vendor's whole catalogue.
// An unscoped promotion applies everywhere, which is the common case.
function promotionAppliesToCategory(promotion, category) {
  const scope = promotion.scope_categories;
  if (!Array.isArray(scope) || !scope.length) return true;
  if (!category) return false;
  const target = normalized(category);
  return scope.some(entry => normalized(entry) === target);
}

export function discountPercentForVendor(vendor, when = new Date(), category = null) {
  const standard = Number(VENDOR_CONFIG[vendor]?.discount_percent || 0);
  const overrides = PROMOTIONS
    .filter(promotion => promotion.vendor === vendor
      && promotion.discount_override_percent != null
      && isPromotionActive(promotion, when)
      && promotionAppliesToCategory(promotion, category))
    .map(promotion => Number(promotion.discount_override_percent))
    .filter(Number.isFinite);
  return overrides.length ? Math.max(standard, ...overrides) : standard;
}

// Breaks the effective rate into the parts a shopper actually sees at
// checkout: the vendor's sitewide sale, and the code that stacks on top.
// The compounded figure is correct for pricing but reads wrong as a label,
// because "49% off with SAMMYC" credits the code for the whole discount.
export function discountBreakdownForVendor(vendor, when = new Date(), category = null) {
  const codePercent = Number(VENDOR_CONFIG[vendor]?.discount_percent || 0);
  const effective = discountPercentForVendor(vendor, when, category);
  const sitewide = PROMOTIONS
    .filter(promotion => promotion.vendor === vendor
      && promotion.discount_override_percent != null
      && Number.isFinite(Number(promotion.sale_percent))
      && isPromotionActive(promotion, when)
      && promotionAppliesToCategory(promotion, category))
    .map(promotion => Number(promotion.sale_percent))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  // Only report a split when the sale genuinely stacks on top of the code.
  const stacks = Number.isFinite(sitewide) && effective > codePercent + 0.01;
  return {
    effective_percent: effective,
    sitewide_percent: stacks ? sitewide : null,
    code_percent: stacks ? codePercent : effective
  };
}

function vendorMeta(vendor, category = null) {
  const base = VENDOR_CONFIG[vendor] || {
    id: slug(vendor || "unknown-vendor"),
    discount_percent: 0,
    affiliate_url: "#",
    logo: ""
  };
  const breakdown = discountBreakdownForVendor(vendor, new Date(), category);
  return {
    ...base,
    discount_percent: breakdown.effective_percent,
    discount_sitewide_percent: breakdown.sitewide_percent,
    discount_code_percent: breakdown.code_percent
  };
}

function exclusionReason(raw) {
  const haystack = normalized([raw.product, raw.listing, raw.sku, raw.category, raw.raw_category].filter(Boolean).join(" "));
  const HARDCODED_EXCLUDES = [
    "ship safely", "shipping protection", "shipping insurance",
    "package protection", "route protection", "gift card", "giftcard",
    "gift certificate", "extend product protection", "extended product protection",
    "helloextend", "helloextend-product-protection",
    "limited edition 7x tested 1st anniversary tee", "anniversary tee",
    "1st anniversary tee", "oversized tee", "tee shirt", "t-shirt",
    "snapback hat", "mhc-tee",
    "qa test product", "internal use only",
    // Apparel and merch (per request, no clothing products on the site)
    "apparel", "researcher hat", "grey on black", "grey-on-black",
    " tee ", " tee(", "hoodie", "sweatshirt", "sweatpants", "beanie",
    "crewneck", "long sleeve", "longsleeve", "tank top", "sticker pack",
    "research apparel", "brand apparel", "logo tee", "logo hat",
    "trucker hat", "dad hat", "polo shirt", "researcher tee",
  ];
  const allExcludes = [...(overridePayload.exclude_terms || []), ...HARDCODED_EXCLUDES];
  const matched = allExcludes.find(term => haystack.includes(normalized(term)));
  return matched ? `exclude-term:${matched}` : "";
}

function isExcluded(raw) {
  return Boolean(exclusionReason(raw));
}

export function normalizeOffer(raw = {}, options = {}) {
  if (isExcluded(raw)) return null;
  const source = { ...raw };
  const vendor = compact(source.company || source.vendor || "Unknown vendor");
  const canonical = findCanonicalRecord(source);
  const category = canonical.category && canonical.category !== DEFAULT_CATEGORY ? canonical.category : inferCategory(canonical.name, source);
  // Category is resolved first so a category-scoped promotion can be applied
  // to this offer specifically rather than to the vendor as a whole.
  const meta = vendorMeta(vendor, category);
  const format = inferFormat(source, category, canonical.name);
  const quantity = inferQuantity(source, canonical.name, format);
  const listedPrices = priceNumbers(source.sale_price || source.price);
  const discount = Number(meta.discount_percent || 0);
  const effectivePrices = listedPrices.map(value => value * (1 - discount / 100));
  const listedMin = listedPrices.length ? Math.min(...listedPrices) : Number.POSITIVE_INFINITY;
  const effectiveMin = effectivePrices.length ? Math.min(...effectivePrices) : listedMin;
  const sourceLayer = compact(options.source_layer || source.source_layer || source.source || "unknown-source");
  const listingMg = parseListingMg(quantity.label);
  const pricePerMg = computePricePerMg(Number.isFinite(effectiveMin) ? roundMoney(effectiveMin) : null, listingMg);
  return {
    vendor_id: meta.id,
    vendor_name: vendor,
    vendor_logo: meta.logo || "",
    vendor_display: compact(meta.display_name || vendor),
    vendor_payment_methods: Array.isArray(meta.payment_methods) ? meta.payment_methods : [],
    vendor_first_order_offer: meta.first_order_offer && typeof meta.first_order_offer === "object" ? meta.first_order_offer : null,
    product_id: canonical.id,
    product_name: canonical.name,
    category,
    format,
    quantity_id: quantity.id,
    quantity_label: quantity.label,
    quantity_sort: quantity.sort,
    listing_mg: listingMg,
    price_per_mg: pricePerMg,
    price_per_mg_label: formatPricePerMg(pricePerMg),
    regular_price_label: formatPriceRange(listedPrices),
    effective_price_label: discount > 0 && listedPrices.length ? formatPriceRange(effectivePrices) : formatPriceRange(listedPrices),
    regular_price_min: Number.isFinite(listedMin) ? roundMoney(listedMin) : null,
    effective_price_min: Number.isFinite(effectiveMin) ? roundMoney(effectiveMin) : null,
    discount_percent: discount,
    discount_sitewide_percent: meta.discount_sitewide_percent ?? null,
    discount_code_percent: meta.discount_code_percent ?? discount,
    coupon_code: discount > 0 ? COUPON_CODE : "",
    in_stock: source.in_stock !== false,
    affiliate_url: compact((meta.use_product_deep_links === true ? source.url : meta.affiliate_url) || meta.affiliate_url || "#"),
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
      excludedRows.push({
        vendor: compact(row.company || row.vendor || "Unknown vendor"),
        raw_product: compact(row.raw_product || row.product || row.name || row.title || row.listing || "Untitled product"),
        raw_listing: compact(row.raw_listing || row.listing || row.product || row.name || row.title || "Untitled product"),
        sku: compact(row.sku || ""),
        reason: exclusionReason(row) || "explicit exclusion"
      });
      continue;
    }
    const key = rawOfferKey(offer);
    if (seen.has(key)) continue;
    seen.add(key);
    normalizedRows.push(offer);
  }

  // One card per compound. Formats (vials, capsules, nasal sprays, liquids) used
  // to split a compound into separate cards, which meant the same compound
  // appeared several times in the grid and each copy only carried a slice of the
  // vendors. Formats are now a dimension inside the card, alongside size.
  const cards = new Map();
  for (const offer of normalizedRows) {
    const cardKey = offer.product_id;
    if (!cards.has(cardKey)) {
      cards.set(cardKey, {
        id: cardKey,
        product_id: offer.product_id,
        name: offer.product_name,
        category: offer.category,
        mapped: true,
        variants: new Map(),
        formats: new Map(),
        vendorNames: new Set(),
        offer_count: 0
      });
    }
    const card = cards.get(cardKey);
    card.offer_count += 1;
    card.vendorNames.add(offer.vendor_name);
    if (!offer.mapped) card.mapped = false;
    if (card.category === DEFAULT_CATEGORY && offer.category !== DEFAULT_CATEGORY) card.category = offer.category;
    const formatId = slug(offer.format) || "other";
    if (!card.formats.has(formatId)) {
      card.formats.set(formatId, {
        id: formatId,
        label: offer.format,
        offer_count: 0,
        vendorNames: new Set()
      });
    }
    const formatEntry = card.formats.get(formatId);
    formatEntry.offer_count += 1;
    formatEntry.vendorNames.add(offer.vendor_name);
    const variantKey = `${formatId}::${offer.quantity_id}`;
    if (!card.variants.has(variantKey)) {
      card.variants.set(variantKey, {
        id: variantKey,
        quantity_id: offer.quantity_id,
        label: offer.quantity_label,
        format: offer.format,
        format_id: formatId,
        sort: offer.quantity_sort,
        suppliers: new Map(),
        all_offer_count: 0
      });
    }
    const variant = card.variants.get(variantKey);
    variant.all_offer_count += 1;
    const supplierKey = normalized([
      offer.vendor_id,
      offer.source_product_id,
      offer.source_variation_id,
      offer.raw_listing,
      offer.sku,
      offer.regular_price_label
    ].join(" || "));
    variant.suppliers.set(supplierKey, bestOffer(variant.suppliers.get(supplierKey), stripInternalOffer(offer)));
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
        quantity_id: variant.quantity_id,
        label: variant.label,
        format: variant.format,
        format_id: variant.format_id,
        full_label: `${variant.label} ${variant.format}`,
        sort: variant.sort,
        supplier_count: suppliers.length,
        all_offer_count: variant.all_offer_count,
        suppliers
      };
    }).sort((a, b) => b.supplier_count - a.supplier_count || a.sort - b.sort || a.label.localeCompare(b.label));
    const allSuppliers = variants.flatMap(variant => variant.suppliers);
    const priced = allSuppliers.map(offer => offer.effective_price_min).filter(value => value != null);
    const formats = [...card.formats.values()].map(entry => ({
      id: entry.id,
      label: entry.label,
      offer_count: entry.offer_count,
      supplier_count: entry.vendorNames.size
    })).sort((a, b) => b.supplier_count - a.supplier_count || b.offer_count - a.offer_count || a.label.localeCompare(b.label));
    return {
      id: card.id,
      product_id: card.product_id,
      name: card.name,
      category: card.category,
      format: formats.length ? formats[0].label : DEFAULT_FORMAT,
      formats,
      format_labels: formats.map(entry => entry.label),
      mapped: card.mapped,
      supplier_count: card.vendorNames.size,
      offer_count: card.offer_count,
      lowest_effective_price: priced.length ? Math.min(...priced) : null,
      variants
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

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
  const categories = {};
  const formats = {};
  for (const offer of normalizedRows) {
    vendors[offer.vendor_name] = (vendors[offer.vendor_name] || 0) + 1;
    layers[offer.source_layer] = (layers[offer.source_layer] || 0) + 1;
    categories[offer.category] = (categories[offer.category] || 0) + 1;
    formats[offer.format] = (formats[offer.format] || 0) + 1;
  }
  const mappedOfferCount = normalizedRows.filter(offer => offer.mapped).length;
  const supplyOfferCount = normalizedRows.filter(offer => offer.category === "Supplies" || offer.format === "Supplies").length;
  const reviewOfferCount = unmapped.length;
  const mappedCardCount = productCards.filter(card => card.mapped).length;
  const reviewCardCount = productCards.length - mappedCardCount;

  return {
    schema_version: "catalog-v1",
    engine_version: ENGINE_VERSION,
    generated_at: new Date().toISOString(),
    coupon_code: COUPON_CODE,
    product_card_count: productCards.length,
    normalized_offer_count: normalizedRows.length,
    visible_unmapped_count: unmapped.length,
    mapped_offer_count: mappedOfferCount,
    supply_offer_count: supplyOfferCount,
    review_offer_count: reviewOfferCount,
    mapped_card_count: mappedCardCount,
    review_card_count: reviewCardCount,
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
      mapped_offer_count: mappedOfferCount,
      supply_offer_count: supplyOfferCount,
      review_offer_count: reviewOfferCount,
      mapped_card_count: mappedCardCount,
      review_card_count: reviewCardCount,
      excluded_count: excludedRows.length,
      silent_drop_count: 0,
      vendors,
      layers,
      categories,
      formats,
      vendor_status: options.vendor_status || {},
      unmapped_products: unmapped,
      excluded_products: excludedRows,
      warnings: options.warnings || []
    }
  };
}

export function publicSnapshot(snapshot = {}) {
  const { raw_offers_by_vendor, ...publicData } = snapshot || {};
  return publicData;
}

// Derive the milligram weight of a listing from its size label so we can compute
// a true price-per-mg. Returns null whenever the label is ambiguous, because a
// wrong $/mg is far worse than no $/mg.
//
// Deliberately rejected:
//   "5mg / 10mg"   multi-size listing, no single weight
//   "10ml", "60ml" volume, not weight
//   "32g", "31g / 10pk"  these are NEEDLE GAUGES, not grams of peptide
//   "Standard listing", "Choose size on vendor site", "BW", "000iu"
// Grams are only accepted at <= 10, which separates a real 1g raw powder from a
// 30g syringe gauge.
export function parseListingMg(label) {
  if (!label) return null;
  const text = String(label).trim().toLowerCase();
  if (text.includes("/")) return null;            // multi-size or bundled listing
  const match = text.match(/^([0-9]+(?:\.[0-9]+)?)\s*(mg|mcg|g)$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2];
  if (unit === "mg") return value;
  if (unit === "mcg") return value / 1000;
  if (unit === "g") return value <= 10 ? value * 1000 : null;  // >10 "g" is a gauge
  return null;
}

export function computePricePerMg(price, mg) {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(mg) || mg <= 0) return null;
  const perMg = price / mg;
  if (!Number.isFinite(perMg) || perMg <= 0) return null;
  return Math.round(perMg * 10000) / 10000;
}

export function formatPricePerMg(perMg) {
  if (!Number.isFinite(perMg) || perMg <= 0) return "";
  if (perMg >= 1) return "$" + perMg.toFixed(2) + "/mg";
  if (perMg >= 0.01) return "$" + perMg.toFixed(3).replace(/0$/, "") + "/mg";
  return "$" + perMg.toFixed(4) + "/mg";
}
