import { getStore } from "@netlify/blobs";

const STORE_NAME = "mpp-product-snapshots";
const SNAPSHOT_KEY = "latest";
const SITE_ORIGIN = (process.env.URL || "https://mypeptideprice.com").replace(/\/+$/, "");

async function fetchJSONWithTimeout(url, ms = 25000) {
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

export default async () => {
  const started = Date.now();
  const snapshot = await fetchJSONWithTimeout(`${SITE_ORIGIN}/.netlify/functions/all-products?scheduled=${Date.now()}`, 25000);
  if (!snapshot || !Array.isArray(snapshot.products) || snapshot.products.length === 0) {
    throw new Error("Scheduled snapshot refresh returned no products");
  }

  const payload = {
    ...snapshot,
    snapshot_updated_at: new Date().toISOString(),
    snapshot_refresh_ms: Date.now() - started
  };
  const store = getStore(STORE_NAME);
  await store.setJSON(SNAPSHOT_KEY, payload, {
    metadata: { updated_at: payload.snapshot_updated_at, count: payload.products.length }
  });
  console.log(`Stored MPP product snapshot: ${payload.products.length} products in ${payload.snapshot_refresh_ms}ms`);
};
