import { getStore } from "@netlify/blobs";

const STORE_NAME = "mpp-product-snapshots";
const SNAPSHOT_KEY = "latest";
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
      "X-MPP-Snapshot-Source": source
    }
  });
}

async function fetchJSONWithTimeout(url, ms = 9000) {
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
      return response(snapshot, 200, "blob");
    }
  } catch (error) {
    console.warn("Snapshot blob read skipped:", error.message);
  }

  // Safe first-deploy fallback. The combined endpoint is also CDN cached.
  try {
    const origin = new URL(req.url || FALLBACK_ORIGIN).origin || FALLBACK_ORIGIN;
    const live = await fetchJSONWithTimeout(`${origin}/.netlify/functions/all-products`, 9000);
    if (live && Array.isArray(live.products) && live.products.length > 0) {
      return response(live, 200, "live-fallback");
    }
    throw new Error("No products returned");
  } catch (error) {
    return response({ error: "Snapshot unavailable", detail: error.message, products: [] }, 503, "unavailable");
  }
};
