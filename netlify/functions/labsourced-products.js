// Netlify Serverless Function — LabSourced Peptides Product Feed
// Public API — no credentials needed, CORS open
// Deployed at: https://mypeptideprice.com/.netlify/functions/labsourced-products

const FEED_URL = "https://labsourced.com/api/public/products";

function mapCategory(name) {
  const n = name.toLowerCase();
  if (n.includes("glp") || n.includes("semaglutide") || n.includes("tirzepatide") || n.includes("retatrutide") || n.includes("cagrilintide") || n.includes("weight") || n.includes("orforglipron") || n.includes("mazdutide")) return "GLP-1 & Incretin";
  if (n.includes("bpc") || n.includes("tb-500") || n.includes("tb500") || n.includes("wolverine") || n.includes("repair") || n.includes("kpv") || n.includes("ll-37") || n.includes("ll37")) return "Repair & Recovery";
  if (n.includes("nad") || n.includes("epitalon") || n.includes("snap-8") || n.includes("tesamorelin") || n.includes("longevity") || n.includes("anti-ag") || n.includes("humanin") || n.includes("mtp-31")) return "Longevity & Cellular Health";
  if (n.includes("semax") || n.includes("selank") || n.includes("dihexa") || n.includes("nootropic") || n.includes("cogni") || n.includes("cerebrolysin")) return "Cognitive & Nootropic";
  if (n.includes("ipamorelin") || n.includes("cjc") || n.includes("ghrp") || n.includes("sermorelin") || n.includes("growth") || n.includes("igf") || n.includes("hexarelin") || n.includes("ghrh")) return "Growth Hormone Research";
  if (n.includes("melanotan") || n.includes("pt-141") || n.includes("bremelanotide") || n.includes("kisspeptin") || n.includes("sexual") || n.includes("tanning") || n.includes("mt-1") || n.includes("mt-2")) return "Skin, Tanning & Sexual Health";
  if (n.includes("aod") || n.includes("mots") || n.includes("metabol") || n.includes("energy") || n.includes("lipo") || n.includes("slu-pp")) return "Metabolic & Mitochondrial";
  if (n.includes("capsule") || n.includes("oral") || n.includes("tablet")) return "Capsules";
  if (n.includes("water") || n.includes("bac") || n.includes("acetic") || n.includes("sterile") || n.includes("vial case") || n.includes("kit") || n.includes("suppl") || n.includes("l-carnitine")) return "Supplies";
  return "Other";
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

    const products = (data.products || []).map(p => ({
      product: p.name,
      listing: p.full_name || p.name,
      company: "LabSourced Peptides",
      category: mapCategory(p.name),
      price: `$${parseFloat(p.price).toFixed(2)}`,
      sku: p.sku || p.id,
      in_stock: p.in_stock === true,
      url: p.url ? `${p.url}?ref=SammyC` : null,
      image: p.image || null,
      source: "api"
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        vendor: "LabSourced Peptides",
        fetched_at: data.generated_at || new Date().toISOString(),
        count: products.length,
        products
      })
    };

  } catch (err) {
    console.error("LabSourced feed error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
