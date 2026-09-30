import { readHistory } from "./_shared/catalog-history.mjs";

// Reads the daily price history recorded by catalog-refresh-background.
// recordDailyHistory has been writing one row per compound per day into the
// mpp-catalog-history blob store for a while; nothing read it back until now.
//
// Always answers 200, even with no rows. The caller is a progressive
// enhancement on the compound pages: an empty array means "hide the chart",
// which is a normal state for a compound added this week, not an error.

const MAX_DAYS = 400;
const DEFAULT_DAYS = 90;
// Same shape the generator slugs compound pages with, so /compounds/ghk-cu asks
// for id=ghk-cu. Anything else is a malformed request, not a lookup.
const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

function response(body, status = 200, cacheSeconds = 1800) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "https://mypeptideprice.com",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      // A row only changes once a day, so this is cached far harder than the
      // catalog snapshot. stale-while-revalidate keeps it instant afterwards.
      "Cache-Control": `public, max-age=${cacheSeconds}, stale-while-revalidate=86400`,
      "Netlify-CDN-Cache-Control": `public, durable, max-age=${cacheSeconds}, stale-while-revalidate=86400`
    }
  });
}

export default async request => {
  if (request.method === "OPTIONS") return response({}, 200, 86400);

  let url;
  try { url = new URL(request.url); } catch { return response({ error: "Bad request" }, 400, 0); }

  const id = String(url.searchParams.get("id") || "").trim().toLowerCase();
  if (!ID_RE.test(id)) return response({ error: "Missing or invalid id" }, 400, 0);

  const asked = Number(url.searchParams.get("days"));
  const days = Number.isFinite(asked) && asked > 0 ? Math.min(Math.floor(asked), MAX_DAYS) : DEFAULT_DAYS;

  try {
    const rows = await readHistory(id, days);
    const lows = rows.map(r => Number(r.low)).filter(Number.isFinite);
    return response({
      product_id: id,
      days,
      count: rows.length,
      // Precomputed so the page does not have to, and so the numbers quoted in
      // the caption cannot drift from the ones drawn on the chart.
      low: lows.length ? Math.min(...lows) : null,
      high: lows.length ? Math.max(...lows) : null,
      first: rows.length ? rows[0] : null,
      last: rows.length ? rows[rows.length - 1] : null,
      rows
    });
  } catch (error) {
    // readHistory already swallows its own failures and returns []. Reaching
    // here means something rarer, so it is logged and answered as "no history"
    // rather than as an error the page has to handle separately.
    console.warn("price-history: read failed for", id, error?.message);
    return response({ product_id: id, days, count: 0, low: null, high: null, first: null, last: null, rows: [] });
  }
};
