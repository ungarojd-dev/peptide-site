import { triggerBackgroundRefresh } from "./_shared/catalog-refresh-trigger.mjs";

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

function authorized(request) {
  const expected = process.env.CATALOG_REFRESH_TOKEN;
  if (!expected) return false;
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return bearer === expected || request.headers.get("x-catalog-refresh-token") === expected;
}

export default async request => {
  if (request.method !== "POST") return reply({ error: "Use POST" }, 405);
  if (!authorized(request)) return reply({ error: "Unauthorized" }, 401);
  try {
    const result = await triggerBackgroundRefresh(request, "manual-status-page");
    return reply({
      ok: true,
      accepted: true,
      already_in_progress: result.already_in_progress,
      message: result.already_in_progress ? "A catalog refresh is already running" : "Catalog refresh started in the background",
      refresh_status: result.refresh_status
    }, 202);
  } catch (error) {
    return reply({ error: error.message || String(error) }, 500);
  }
};
