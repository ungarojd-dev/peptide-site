// Serves the raw vendor rows the scheduled refresh keeps in Netlify Blobs, one
// or more vendors at a time.
//
// Why: the deploy-time build (scripts/build-catalog-live.mjs) pulls every vendor
// feed from Netlify's build servers, and some vendors block or challenge that
// traffic while letting the serverless refresh through (Peptira answers the
// build with an HTML challenge page, Zenith with a 403). The live homepage then
// shows 18 vendors while every static page baked at deploy shows 16. This
// endpoint lets the build borrow the rows the function already fetched, so the
// static pages always match what the homepage serves.
//
// The rows are the same product names, sizes, prices and affiliate URLs the
// public catalog already exposes, so there is nothing here that is not already
// on the site. Not indexed, not cached.
import { readRawSnapshot } from "./_shared/catalog-store.mjs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}

export default async request => {
  if (request.method !== "GET") return json({ error: "GET only" }, 405);
  const url = new URL(request.url);
  const wanted = (url.searchParams.get("vendor") || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  let raw;
  try {
    raw = await readRawSnapshot();
  } catch (error) {
    return json({ error: `Blob unavailable: ${error.message}` }, 503);
  }
  const byVendor = raw?.raw_offers_by_vendor || {};
  const status = raw?.diagnostics?.vendor_status || {};
  const rows_by_vendor = {};
  const vendor_status = {};
  for (const vendor of (wanted.length ? wanted : Object.keys(byVendor))) {
    if (!Array.isArray(byVendor[vendor]) || !byVendor[vendor].length) continue;
    rows_by_vendor[vendor] = byVendor[vendor];
    vendor_status[vendor] = status[vendor] || {};
  }
  return json({
    snapshot_updated_at: raw?.snapshot_updated_at || "",
    last_live_refresh_at: raw?.last_live_refresh_at || "",
    rows_by_vendor,
    vendor_status
  });
};
