// Netlify Serverless Function — Instant Peptides Product Feed
// Fetches from their custom JSON feed endpoint
// Deployed at: https://mypeptideprice.com/.netlify/functions/instant-products

const FEED_URL = "https://instantpeptides.com/api/feeds/peptide-price";

function mapCategory(name) {
  const n = name.toLowerCase();
  if (n.includes("glp") || n.includes("semaglutide") || n.includes("tirzepatide") || n.includes("retatrutide") || n.includes("cagrilintide") || n.includes("glp-1") || n.includes("glp-2") || n.includes("weight")) return "GLP-1 & Incretin";
  if (n.includes("bpc") || n.includes("tb-500") || n.includes("tb500") || n.includes("recover") || n.includes("heal") || n.includes("repair")) return "Repair & Recovery";
  if (n.includes("nad") || n.includes("epitalon") || n.includes("longev") || n.includes("anti-ag") || n.includes("snap-8") || n.includes("tesamorelin")) return "Longevity & Cellular Health";
  if (n.includes("semax") || n.includes("selank") || n.includes("nootropic") || n.includes("cogni") || n.includes("dihexa")) return "Cognitive & Nootropic";
  if (n.includes("ipamorelin") || n.includes("cjc") || n.includes("ghrp") || n.includes("growth") || n.includes("ghrh") || n.includes("igf") || n.includes("sermorelin")) return "Growth Hormone Research";
  if (n.includes("melanotan") || n.includes("mt-") || n.includes("pt-141") || n.includes("bremelanotide") || n.includes("sexual") || n.includes("tann") || n.includes("kisspeptin")) return "Skin, Tanning & Sexual Health";
  if (n.includes("aod") || n.includes("mots") || n.includes("metabol") || n.includes("energy") || n.includes("lipo")) return "Metabolic & Mitochondrial";
  if (n.includes("capsule") || n.includes("oral") || n.includes("tablet")) return "Capsules";
  if (n.includes("water") || n.includes("bac") || n.includes("acetic") || n.includes("sterile") || n.includes("vial") || n.includes("kit") || n.includes("suppl")) return "Supplies";
  return "Other";
}

function buildListing(product, variant) {
  const qty = variant.pack_qty > 1 ? ` (${variant.pack_qty} vials)` : "";
  return `${product.name} — ${variant.size}${variant.unit}${qty}`;
}

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "https://mypeptideprice.com",
    "Access-Control-Allow-Methods": "GET",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=900, stale-while-revalidate=21600"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    const resp = await fetch(FEED_URL);
    if (!resp.ok) throw new Error(`Feed error: ${resp.status}`);
    const data = await resp.json();

    const products = [];

    for (const p of data.products || []) {
      const category = mapCategory(p.name);
      const variants = p.variants || [];

      if (variants.length === 0) continue;

      // One row per variant
      for (const v of variants) {
        const listing = buildListing(p, v);
        products.push({
          product: p.name,
          listing,
          company: "Instant Peptides",
          category,
          price: `$${parseFloat(v.price).toFixed(2)}`,
          sku: `${v.size}${v.unit}-${v.form}-x${v.pack_qty}`,
          in_stock: v.in_stock === true,
          url: p.url ? (p.url + (p.url.includes("?") ? "&" : "?") + "ref=SAMMYC") : null,
          source: "api"
        });
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        vendor: "Instant Peptides",
        fetched_at: new Date().toISOString(),
        count: products.length,
        products
      })
    };

  } catch (err) {
    console.error("Instant Peptides feed error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
