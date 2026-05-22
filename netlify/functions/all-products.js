// Netlify Serverless Function, combined cached product feed
// Browser calls this once. This function fans out to vendor feeds server-side,
// returns whatever succeeds quickly, and lets the homepage keep static fallback data for failures.

const FEEDS = [
  { vendor: "Glacier Aminos", path: "/.netlify/functions/glacier-products" },
  { vendor: "Southern Aminos", path: "/.netlify/functions/southern-products" },
  { vendor: "Flawless Compounds", path: "/.netlify/functions/flawless-products" },
  { vendor: "Glow Aminos", path: "/.netlify/functions/glow-products" },
  { vendor: "Mile High Peptides", path: "/.netlify/functions/milehigh-products" },
  { vendor: "Instant Peptides", path: "/.netlify/functions/instant-products" },
  { vendor: "LabSourced Peptides", path: "/.netlify/functions/labsourced-products" }
];

function getOrigin(event) {
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers.host || "mypeptideprice.com";
  return `${proto}://${host}`;
}

async function fetchJsonWithTimeout(url, ms = 7000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(tid);
  }
}

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "https://mypeptideprice.com",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=900, stale-while-revalidate=21600"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const origin = getOrigin(event);
  const started = Date.now();

  const settled = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const data = await fetchJsonWithTimeout(`${origin}${feed.path}`, 7000);
      return {
        vendor: feed.vendor,
        count: Array.isArray(data.products) ? data.products.length : 0,
        products: Array.isArray(data.products) ? data.products : []
      };
    })
  );

  const products = [];
  const vendors = [];
  const errors = [];

  settled.forEach((result, index) => {
    const feed = FEEDS[index];
    if (result.status === "fulfilled" && result.value.products.length > 0) {
      vendors.push(feed.vendor);
      products.push(...result.value.products);
    } else {
      errors.push({
        vendor: feed.vendor,
        error: result.status === "rejected" ? result.reason.message : "No products returned"
      });
    }
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      fetched_at: new Date().toISOString(),
      elapsed_ms: Date.now() - started,
      count: products.length,
      vendors,
      errors,
      products
    })
  };
};
