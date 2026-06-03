import fallbackSnapshot from "../../data/catalog-v3-fallback-snapshot.json" with { type: "json" };
import { buildCatalog, publicSnapshot } from "./_shared/catalog-v3-engine.mjs";
import { readCatalogV3Snapshot } from "./_shared/catalog-v3-store.mjs";

const FALLBACK_ORIGIN = "https://mypeptideprice.com";

function response(body, status = 200, source = "blob") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "https://mypeptideprice.com",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=21600",
      "Netlify-CDN-Cache-Control": "public, durable, max-age=900, stale-while-revalidate=21600",
      "X-MPP-Catalog-V3-Source": source
    }
  });
}

async function fetchJSON(url, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export default async req => {
  if (req.method === "OPTIONS") return response({}, 200, "preflight");
  try {
    const { snapshot, source } = await readCatalogV3Snapshot();
    if (snapshot && Array.isArray(snapshot.products) && snapshot.products.length) {
      return response(publicSnapshot(snapshot), 200, source);
    }
  } catch (error) {
    console.warn("Catalog V3 blob read skipped:", error.message);
  }

  try {
    const origin = new URL(req.url || FALLBACK_ORIGIN).origin || FALLBACK_ORIGIN;
    const legacy = await fetchJSON(`${origin}/.netlify/functions/products-snapshot?catalog_v3_bootstrap=1`, 9000);
    const products = Array.isArray(legacy.products) ? legacy.products : [];
    if (products.length) {
      const catalog = buildCatalog(products.map(row => ({ ...row, source_layer: "legacy-live-bootstrap" })), {
        warnings: ["Catalog V3 blob was not ready, so the existing stable raw snapshot was grouped server-side for this response"]
      });
      return response(catalog, 200, "legacy-live-bootstrap");
    }
  } catch (error) {
    console.warn("Catalog V3 live bootstrap skipped:", error.message);
  }

  return response(fallbackSnapshot, 200, "bundled-fallback");
};
