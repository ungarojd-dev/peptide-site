import { randomUUID } from "node:crypto";
import { readRefreshStatus, writeRefreshStatus } from "./catalog-store.mjs";

const ACTIVE_STATUS_MAX_AGE_MS = 16 * 60 * 1000;

function compact(value) {
  return value == null ? "" : String(value).trim();
}

function ageMs(status = {}) {
  const updated = Date.parse(status.status_updated_at || status.requested_at || "");
  return Number.isFinite(updated) ? Date.now() - updated : Number.POSITIVE_INFINITY;
}

export function isRecentActiveRefresh(status = {}) {
  if (!status || typeof status !== "object") return false;
  return ["queued", "running"].includes(status.state) && ageMs(status) < ACTIVE_STATUS_MAX_AGE_MS;
}

function backgroundEndpoint(request) {
  const requestOrigin = new URL(request.url).origin;
  const configured = compact(process.env.URL || process.env.DEPLOY_PRIME_URL);
  const origin = requestOrigin && requestOrigin !== "null" ? requestOrigin : configured;
  if (!origin) throw new Error("Unable to determine the deployed site origin for the background refresh worker");
  return new URL("/.netlify/functions/catalog-refresh-background", origin.replace(/\/$/, "")).href;
}

export async function triggerBackgroundRefresh(request, requestedBy = "manual") {
  let current = null;
  try { current = await readRefreshStatus(); } catch {}

  if (isRecentActiveRefresh(current)) {
    return {
      accepted: true,
      already_in_progress: true,
      refresh_status: current
    };
  }

  const token = compact(process.env.CATALOG_REFRESH_TOKEN);
  if (!token) throw new Error("CATALOG_REFRESH_TOKEN is not configured");

  const refreshId = randomUUID();
  const requestedAt = new Date().toISOString();
  const queued = await writeRefreshStatus({
    state: "queued",
    refresh_id: refreshId,
    requested_at: requestedAt,
    requested_by: requestedBy,
    message: "Catalog refresh queued for background processing"
  });

  try {
    const response = await fetch(backgroundEndpoint(request), {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "x-catalog-refresh-token": token
      },
      body: JSON.stringify({ refresh_id: refreshId, requested_at: requestedAt, requested_by: requestedBy })
    });

    if (response.status !== 202 && !response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Background refresh invocation failed with HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`);
    }
  } catch (error) {
    const message = error.message || String(error);
    await writeRefreshStatus({ ...queued, state: "error", error: message, failed_at: new Date().toISOString() });
    throw error;
  }

  return {
    accepted: true,
    already_in_progress: false,
    refresh_status: queued
  };
}
