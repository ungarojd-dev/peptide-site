import fallbackSnapshot from "../../data/catalog-fallback-snapshot.json" with { type: "json" };
import { readPublicSnapshot } from "./_shared/catalog-store.mjs";

function response(body, source = "blob") {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "https://mypeptideprice.com",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=21600",
      "Netlify-CDN-Cache-Control": "public, durable, max-age=300, stale-while-revalidate=21600",
      "X-MPP-Catalog-Source": source
    }
  });
}

export default async request => {
  if (request.method === "OPTIONS") return response({}, "preflight");
  try {
    const snapshot = await readPublicSnapshot();
    if (snapshot?.products?.length) return response(snapshot, "blob");
  } catch (error) {
    console.warn("Catalog Blob unavailable:", error.message);
  }
  return response(fallbackSnapshot, "bundled-fallback");
};
