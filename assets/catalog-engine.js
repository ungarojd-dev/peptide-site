(function(global){
  "use strict";

  const VERSION = "4.0.0";

  function str(value){ return value == null ? "" : String(value); }
  function compact(value){ return str(value).replace(/[\u2013\u2014]/g,"-").replace(/\s+/g," ").trim(); }
  function lower(value){ return compact(value).toLowerCase(); }
  function hasAny(text, terms){ return terms.some(term => text.includes(term)); }
  function uniq(values){ return [...new Set(values.filter(Boolean))]; }

  const VENDOR_PREFIX = /^(glacier\s+aminos?\s*|ion\s*peptide\s*|southern\s*aminos?\s*|labsourced\s*peptides?\s*|mile\s*high\s*(?:compounds?|peptides?)?\s*|solyn\s*labs?\s*|oneday\s*compounds?\s*|glow\s*aminos?\s*|flawless\s*compounds?\s*|instant\s*peptides?\s*)/i;

  function cleanProductTitle(raw){
    let value = compact(raw);
    value = value.replace(VENDOR_PREFIX, "").trim();
    value = value
      .replace(/\s*\((?:research\s*)?(?:peptide\s*)?(?:vial|capsules?|spray|liquid|topical)\)\s*$/i, "")
      .replace(/\s*(?:research\s*)?(?:peptide\s+)?(?:vial|capsules?|spray|liquid|topical)\s*$/i, "")
      .replace(/\s*[-:]\s*\d[\d.,]*(?:\s*\/\s*\d[\d.,]*)*\s*(?:mcg|mg|g|ml|iu|units?)\b.*$/i, "")
      .replace(/\s+\d[\d.,]*(?:\s*\/\s*\d[\d.,]*)*\s*(?:mcg|mg|g|ml|iu|units?)\b(?:\s+or\s+\d[\d.,]*\s*(?:mcg|mg|g|ml|iu|units?)\b)*\s*$/i, "")
      .replace(/\s*\(\s*\d[\d.,]*(?:\s*\/\s*\d[\d.,]*)*\s*(?:mcg|mg|g|ml|iu|units?)\s*\)\s*$/i, "")
      .trim();
    return value || compact(raw) || "Untitled API Product";
  }

  function offerText(offer){
    return lower([
      offer && offer.product,
      offer && offer.listing,
      offer && offer.sku,
      offer && offer.category,
      offer && offer.raw_category
    ].join(" "));
  }

  function detectGlpComponents(raw){
    const s = lower(raw);
    const out = [];
    const add = name => { if(!out.includes(name)) out.push(name); };

    const sema =
      /\bsemaglutide\b|\bsema\b|\bsm\b|\bpep[\s-]*sm\b|\bpeptide[\s-]*sm\b|\bion[\s-]*1s\b|\bgla[\s-]*1(?:\s*sm)?\b|\bglp[\s-]*1(?:\s*sm)?\b/.test(s);
    const tirz =
      /\btirzepatide\b|\btirz\b|\b(?:tz|trz)\b|\bpep[\s-]*(?:tz|trz)\b|\bpeptide[\s-]*(?:tz|trz)\b|\bion[\s-]*2t\b|\bgla[\s-]*2(?:\.5)?(?:\s*trz)?\b|\bglp[\s-]*2(?:\s*trz)?\b|\bglp2[\s-]*t\b|\bglp[\s-]*t2\b|\bmhc[\s-]*2(?:\s*trz)?\b|\bsa[\s-]*2t\b/.test(s);
    const reta =
      /\bretatrutide\b|\breta\b|\brt\b|\bpep[\s-]*rt\b|\bpeptide[\s-]*rt\b|\bion[\s-]*3r\b|\bgla[\s-]*3(?:\s*rt)?\b|\bglp[\s-]*3(?:\s*rt)?\b|\bglp3[\s-]*r\b|\bglp[\s-]*r3\b|\boc[\s-]*3rt\b|\bsa[\s-]*3r\b/.test(s);
    const cagri =
      /\bcagrilintide\b|\bcagrilinitide\b|\bcagri\b|\bpep[\s-]*cag\b|\bsa[\s-]*4c\b/.test(s);

    if(sema) add("Peptide SM");
    if(tirz) add("Peptide TZ");
    if(reta) add("Peptide RT");
    if(cagri) add("Cagrilintide");
    return out;
  }

  function canonicalGlpFamily(raw){
    const parts = detectGlpComponents(raw);
    if(!parts.length) return "";
    if(parts.length === 1) return parts[0];
    const order = ["Peptide SM","Peptide TZ","Peptide RT","Cagrilintide"];
    return order.filter(x => parts.includes(x)).join(" + ") + " Blend";
  }

  const FAMILY_RULES = [
    [/\bbpc[\s-]*157\b.*\btb[\s-]*500\b.*\bkpv\b/i, "BPC-157 + TB-500 + KPV"],
    [/\bbpc[\s-]*157\b.*\btb[\s-]*500\b|\bwolverine\b/i, "BPC-157 + TB-500"],
    [/\bbpc[\s-]*kpv\b/i, "BPC-KPV"],
    [/\bbpc[\s-]*157\b/i, "BPC-157"],
    [/\btb[\s-]*500\b|\btb4\b|\btb[\s-]*4\b/i, "TB-500"],
    [/\bghk[\s-]*cu\b.*\bkpv\b|\bghkpv\b/i, "GHK-Cu + KPV"],
    [/\bghk[\s-]*cu\b/i, "GHK-Cu"],
    [/\bahk[\s-]*cu\b/i, "AHK-Cu"],
    [/\bcjc[\s-]*1295\b.*\bipamorelin\b|\bcjc\s*\/\s*ipa\b|\bcjc\s*\/\s*ipamo\b/i, "CJC-1295 + Ipamorelin"],
    [/\bcjc[\s-]*1295\b/i, "CJC-1295"],
    [/\btesamorelin\b.*\bipamorelin\b|\btesa\s*\/\s*ipa(?:mo)?\b/i, "Tesamorelin + Ipamorelin"],
    [/\btesamorelin\b/i, "Tesamorelin"],
    [/\bipamorelin\b|\bipamo\b/i, "Ipamorelin"],
    [/\bsermorelin\b|\bsermo\b/i, "Sermorelin"],
    [/\bsemax\b.*\bselank\b|\bsemax\s*\/\s*selank\b/i, "Semax + Selank"],
    [/\bsemax\b/i, "Semax"],
    [/\bselank\b/i, "Selank"],
    [/\bnad\+?\b/i, "NAD+"],
    [/\bmots[\s-]*c\b/i, "MOTS-C"],
    [/\bss[\s-]*31\b|§[\s-]*31/i, "SS-31"],
    [/\b5[\s-]*amino[\s-]*1mq\b/i, "5-Amino-1MQ"],
    [/\baod[\s-]*9604\b/i, "AOD-9604"],
    [/\bslu[\s-]*pp[\s-]*332\b/i, "SLU-PP-332"],
    [/\bpt[\s-]*141\b/i, "PT-141"],
    [/\bmelanotan\s*(?:i|1)\b|\bmt[\s-]*1\b/i, "Melanotan I"],
    [/\bmelanotan\s*(?:ii|2)\b|\bmt[\s-]*2\b/i, "Melanotan II"],
    [/\bepitalon\b|\bepithalon\b/i, "Epitalon"],
    [/\bthymosin\s*alpha[\s-]*1\b/i, "Thymosin Alpha-1"],
    [/\bthymalin\b|\bthymulin\b/i, "Thymalin"],
    [/\bkpv\b/i, "KPV"],
    [/\bll[\s-]*37\b/i, "LL-37"],
    [/\bara[\s-]*290\b/i, "ARA-290"],
    [/\bfoxo?4[\s-]*dri\b/i, "FOXO4-DRI"],
    [/\bglutathione\b/i, "Glutathione"],
    [/\btesofensine\b/i, "Tesofensine"],
    [/\bmazdutide\b/i, "Mazdutide"],
    [/\borforglipron\b/i, "Orforglipron"],
    [/\bcerebrolysin\b/i, "Cerebrolysin"],
    [/\bvip\b/i, "VIP"],
    [/\bdsip\b/i, "DSIP"],
    [/\bkisspeptin(?:[\s-]*10)?\b/i, "Kisspeptin"],
    [/\bhexarelin\b/i, "Hexarelin"],
    [/\bigf[\s-]*(?:1\s*)?lr3\b/i, "IGF-LR3"],
    [/\blipo[\s-]*c\b/i, "LIPO-C"],
    [/\bsnap[\s-]*8\b/i, "Snap-8"],
    [/\bmethylene\s*blue\b|\bmetholine\s*blue\b/i, "Methylene Blue"],
    [/\bglow\b/i, "GLOW"],
    [/\bklow\b/i, "KLOW"],
    [/\bcardalax\b|\bcartalax\b/i, "Cartalax"],
    [/\btestagen\b/i, "Testagen"],
    [/\bpinealon\b/i, "Pinealon"],
    [/\bhumanin\b/i, "Humanin"],
    [/\bmtp[\s-]*31\b|\bmtt[\s-]*31\b/i, "MTP-31"]
  ];

  function familyForText(raw){
    const rawText = compact(raw);
    const glp = canonicalGlpFamily(rawText);
    if(glp) return glp;
    for(const [rule, family] of FAMILY_RULES){
      if(rule.test(rawText)) return family;
    }
    return cleanProductTitle(rawText);
  }

  function familyForOffer(offer){
    const raw = [offer && offer.product, offer && offer.listing, offer && offer.sku].filter(Boolean).join(" ");
    return familyForText(raw);
  }

  const SUPPLY_TERMS = ["bacteriostatic","bac water","bac-water","sterile water","syringe","needle","pen needle","peptide pen","cartridge","vial cover","vial cap","caps/cover","travel case","starter kit","reconstitution","alcohol swab","storage case","case (","shipping protection","gift card"];

  function categoryForOffer(offer, family){
    const text = offerText(offer) + " " + lower(family);
    const components = detectGlpComponents(text);
    if(components.length || hasAny(text,["glp","mazdutide","orforglipron","tesofensine","survodutide","liraglutide","amycretin"])) return "GLP-1 & Incretin";
    if(hasAny(text,SUPPLY_TERMS)) return "Supplies";
    if(hasAny(text,["bpc","tb-500","tb500","kpv","ll-37","wolverine","repair","recovery","ara-290"])) return "Repair & Recovery";
    if(hasAny(text,["cjc","ipamorelin","sermorelin","tesamorelin","ghrp","hexarelin","igf","hgh","growth hormone"])) return "Growth Hormone Research";
    if(hasAny(text,["semax","selank","dihexa","cerebrolysin","vip","dsip","cortexin","nootropic"])) return "Cognitive & Nootropic";
    if(hasAny(text,["pt-141","melanotan","mt-1","mt-2","kisspeptin","hcg","tanning","libido"])) return "Skin, Tanning & Sexual Health";
    if(hasAny(text,["epitalon","epithalon","thymalin","thymulin","pinealon","vilon","vesugen","bioregulator"])) return "Bioregulators";
    if(hasAny(text,["mots","ss-31","§-31","aod","5-amino","slu-pp","glutathione","adipotide","metabolic","mitochondrial"])) return "Metabolic & Mitochondrial";
    if(hasAny(text,["nad","ghk-cu","ahk-cu","snap-8","foxo4","fox04","humanin","longevity","cellular"])) return "Longevity & Cellular Health";
    const existing = compact(offer && (offer.raw_category || offer.category));
    const map = {
      "GLP / Weight Loss":"GLP-1 & Incretin",
      "Recovery & Healing":"Repair & Recovery",
      "Longevity & Anti-Aging":"Longevity & Cellular Health",
      "Growth Hormone":"Growth Hormone Research",
      "Sexual Health & Tanning":"Skin, Tanning & Sexual Health",
      "Metabolic & Energy":"Metabolic & Mitochondrial"
    };
    return map[existing] || existing || "Uncategorized";
  }

  function formatForOffer(offer, family, category){
    const text = offerText(offer) + " " + lower(family) + " " + lower(category);
    if(hasAny(text,SUPPLY_TERMS)) return "Supplies";
    if(hasAny(text,["capsule","capsules"," caps","tablet","tablets","troche","oral"])) return "Capsules";
    if(hasAny(text,["nasal","intranasal","spray"])) return "Nasal Sprays";
    if(hasAny(text,["topical","cream","serum","lotion"])) return "Topicals";
    if(hasAny(text,["liquid","drops","solution"])) return "Liquids";
    if(hasAny(text,["blend","wolverine","klow","glow blend"]) || text.includes(" + ")) return "Peptides";
    if(hasAny(text,["amino","l-carnitine"])) return "Aminos";
    if(category === "Bioregulators") return "Bioregulators";
    return "Peptides";
  }

  function normalizeOffer(raw){
    const source = raw || {};
    const product = compact(source.product || source.name || source.title || source.listing || "Untitled API Product");
    const listing = compact(source.listing || source.full_name || product);
    const normalized = { ...source, product, listing };
    normalized.raw_product = source.raw_product || product;
    normalized.raw_listing = source.raw_listing || listing;
    normalized.raw_category = source.raw_category || source.source_category || source.vendor_category || source.original_category || source.category || "";
    normalized.family = familyForOffer(normalized);
    normalized.category = categoryForOffer(normalized, normalized.family);
    normalized.format = formatForOffer(normalized, normalized.family, normalized.category);
    return normalized;
  }

  function extractVariation(offerOrProduct, maybeListing){
    const offer = typeof offerOrProduct === "object" ? offerOrProduct : { product: offerOrProduct, listing: maybeListing };
    const product = compact(offer.product);
    const listing = compact(offer.listing);
    if(!listing || listing.toLowerCase() === product.toLowerCase()) return "";
    const escaped = product.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    let value = listing.replace(new RegExp("^"+escaped+"\\s*(?:[-:/]|\\u2013|\\u2014)\\s*","i"),"").trim();
    if(value === listing){
      const suffix = listing.match(/(?:^|\s)(\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|iu))?(?:\s*\([^)]*\))?)\s*$/i);
      value = suffix ? suffix[1] : "";
    }
    if(value.length > 80) return "";
    return value;
  }

  function groupKey(offer){ return lower((offer.format || "Peptides") + "||" + (offer.family || familyForOffer(offer))); }

  function groupOffers(rows){
    const groups = new Map();
    for(const row of rows || []){
      const offer = normalizeOffer(row);
      const key = groupKey(offer);
      if(!groups.has(key)) groups.set(key,{ family:offer.family, category:offer.category, format:offer.format, listings:[], search_aliases:getFamilySearchAliases(offer.family) });
      groups.get(key).listings.push(offer);
    }
    return [...groups.values()];
  }

  function variationKey(offer){ return lower(extractVariation(offer) || "__parent__"); }
  function vendorFamilyKey(offer){ return lower([offer.company, offer.format, offer.family].join("||")); }
  function exactKey(offer){ return lower([offer.company, offer.format, offer.family, variationKey(offer), offer.sku, offer.price, offer.sale_price].join("||")); }

  function dedupe(rows){
    const seen = new Set();
    const out = [];
    for(const raw of rows || []){
      const offer = normalizeOffer(raw);
      const key = exactKey(offer);
      if(seen.has(key)) continue;
      seen.add(key);
      out.push(offer);
    }
    return out;
  }

  function mergeStaticAndLive(staticRows, liveRows){
    const staticOffers = dedupe(staticRows || []);
    const liveOffers = dedupe(liveRows || []);
    const liveVendorFamilies = new Set(liveOffers.map(vendorFamilyKey));
    const retainedStatic = staticOffers.filter(offer => !liveVendorFamilies.has(vendorFamilyKey(offer)));
    return dedupe([...retainedStatic, ...liveOffers]);
  }

  function mergeEnrichment(baseRows, enrichedRows){
    const base = dedupe(baseRows || []);
    const enriched = dedupe(enrichedRows || []);
    if(!enriched.length) return base;
    const enrichedVendorFamilies = new Set(enriched.map(vendorFamilyKey));
    const retained = base.filter(offer => !enrichedVendorFamilies.has(vendorFamilyKey(offer)));
    return dedupe([...retained, ...enriched]);
  }

  function getFamilySearchAliases(family){
    const f = lower(family);
    if(f.includes("peptide sm")) return "semaglutide sema sm pep-sm peptide sm gla-1 glp-1 ion-1s";
    if(f.includes("peptide tz")) return "tirzepatide tirz tz trz pep-tz pep-trz peptide tz peptide trz gla-2 glp-2 ion-2t";
    if(f.includes("peptide rt")) return "retatrutide reta rt pep-rt peptide rt gla-3 glp-3 ion-3r";
    if(f.includes("cagrilintide")) return "cagrilintide cagri pep-cag sa-4c";
    return family;
  }

  function matchesPopularFamily(family, selected){
    if(!selected || selected === "all") return true;
    const f = compact(family);
    if(selected === "NAD+") return f.startsWith("NAD+");
    if(selected === "GHK-Cu") return f.startsWith("GHK-Cu");
    if(selected === "CJC-1295") return f.startsWith("CJC-1295");
    if(selected === "Peptide SM" || selected === "Peptide TZ" || selected === "Peptide RT") return f.includes(selected);
    return f === selected;
  }

  function isGlpOffer(offer){
    const normalized = normalizeOffer(offer);
    const text = offerText(normalized) + " " + lower(normalized.family);
    return normalized.category === "GLP-1 & Incretin" || detectGlpComponents(text).length > 0 || hasAny(text,["mazdutide","orforglipron","tesofensine","survodutide","liraglutide","amycretin"]);
  }

  function matchesGlpPopular(offer, selected){
    if(!selected || selected === "all") return true;
    const normalized = normalizeOffer(offer);
    const family = normalized.family;
    const text = offerText(normalized) + " " + lower(family);
    if(selected === "sm") return family.includes("Peptide SM");
    if(selected === "tz") return family.includes("Peptide TZ");
    if(selected === "rt") return family.includes("Peptide RT");
    if(selected === "cagri") return family.includes("Cagrilintide");
    if(selected === "mazdu") return text.includes("mazdutide");
    if(selected === "oral-glp") return text.includes("orforglipron");
    if(selected === "teso") return text.includes("tesofensine");
    return true;
  }

  function diagnostics(rows){
    const offers = (rows || []).map(normalizeOffer);
    const byVendor = {};
    const byCategory = {};
    const byFormat = {};
    for(const offer of offers){
      byVendor[offer.company || "Unknown Vendor"] = (byVendor[offer.company || "Unknown Vendor"] || 0) + 1;
      byCategory[offer.category] = (byCategory[offer.category] || 0) + 1;
      byFormat[offer.format] = (byFormat[offer.format] || 0) + 1;
    }
    return {
      engine_version: VERSION,
      offer_count: offers.length,
      group_count: groupOffers(offers).length,
      by_vendor: byVendor,
      by_category: byCategory,
      by_format: byFormat,
      uncategorized: offers.filter(o => o.category === "Uncategorized").map(o => ({company:o.company, product:o.product, listing:o.listing, sku:o.sku || ""}))
    };
  }

  global.MPPCatalog = {
    VERSION,
    compact,
    cleanProductTitle,
    detectGlpComponents,
    canonicalGlpFamily,
    familyForText,
    familyForOffer,
    categoryForOffer,
    formatForOffer,
    normalizeOffer,
    extractVariation,
    groupOffers,
    mergeStaticAndLive,
    mergeEnrichment,
    getFamilySearchAliases,
    matchesPopularFamily,
    isGlpOffer,
    matchesGlpPopular,
    diagnostics
  };
})(typeof window !== "undefined" ? window : globalThis);
