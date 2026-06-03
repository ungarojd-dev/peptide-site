import { getStore } from "@netlify/blobs";

const STORE_NAME = "mpp-product-snapshots";
const SNAPSHOT_KEY = "latest-v3";
const FALLBACK_ORIGIN = "https://mypeptideprice.com";

function response(body, status = 200, source = "blob-v3") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "https://mypeptideprice.com",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=120, stale-while-revalidate=900",
      "Netlify-CDN-Cache-Control": "public, durable, max-age=300, stale-while-revalidate=1800",
      "X-MPP-Snapshot-Source": source,
      "X-MPP-Snapshot-Schema": "ingestion-v3"
    }
  });
}

async function fetchJSONWithTimeout(url, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export default async (req) => {
  if (req.method === "OPTIONS") return response({}, 200, "preflight");

  try {
    const store = getStore(STORE_NAME);
    const snapshot = await store.get(SNAPSHOT_KEY, { type: "json" });
    if (snapshot && Array.isArray(snapshot.products) && snapshot.products.length > 0) {
      return response(snapshot, 200, "blob-v3");
    }
  } catch (error) {
    console.warn("Snapshot blob read skipped:", error.message);
  }

  try {
    const origin = new URL(req.url || FALLBACK_ORIGIN).origin || FALLBACK_ORIGIN;
    const live = await fetchJSONWithTimeout(`${origin}/.netlify/functions/all-products?schema=ingestion-v3`, 15000);
    if (live && Array.isArray(live.products) && live.products.length > 0) {
      return response(live, 200, "live-fallback-v3");
    }
    throw new Error("No products returned");
  } catch (error) {
    return response({ error: "Snapshot unavailable", detail: error.message, products: [] }, 503, "unavailable");
  }
};
