// Refreshes vendor_config.json's payment_methods field with real, live data
// pulled from each vendor's WooCommerce payment_gateways endpoint.
//
// This is a MANUAL / low-frequency script, not a live Netlify function.
// Payment gateway configuration essentially never changes day to day, so
// there's no reason to hit this on every catalog price sync or page load.
// Run it by hand (or on an occasional cron/scheduled job) when you want to
// pick up changes, e.g. if a vendor adds crypto or drops a card processor.
//
// Usage:
//   node scripts/refresh-payment-methods.mjs
//
// Requires the same CK/CS environment variables already used for pricing
// (GLACIER_CK, GLACIER_CS, etc.) to be set locally or in your shell.
//
// NOTE: Instant Peptides and LabSourced Peptides run custom JSON APIs, not
// WooCommerce, so they have no payment_gateways endpoint. Those two vendors
// are skipped here and must be updated manually in vendor-config.json.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WOO_VENDOR_API_CONFIG, wooAuth, wooParams, fetchJson } from "../netlify/functions/_shared/vendor-adapters.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "data", "vendor-config.json");

async function fetchEnabledGateways(vendorApiConfig) {
  const auth = wooAuth(vendorApiConfig);
  const params = wooParams(auth);
  const { data } = await fetchJson(`${vendorApiConfig.base}/payment_gateways?${params}`, 15000);
  if (!Array.isArray(data)) return [];
  return data
    .filter(gateway => gateway.enabled === true)
    .map(gateway => gateway.title || gateway.id)
    .filter(Boolean);
}

async function main() {
  const raw = await fs.readFile(CONFIG_PATH, "utf8");
  const config = JSON.parse(raw);
  const results = [];

  for (const vendorApiConfig of WOO_VENDOR_API_CONFIG) {
    const vendorEntry = config.vendors[vendorApiConfig.vendor];
    if (!vendorEntry) {
      results.push({ vendor: vendorApiConfig.vendor, status: "skipped", reason: "not found in vendor-config.json" });
      continue;
    }
    try {
      const methods = await fetchEnabledGateways(vendorApiConfig);
      vendorEntry.payment_methods = methods;
      results.push({ vendor: vendorApiConfig.vendor, status: "ok", methods });
    } catch (error) {
      results.push({ vendor: vendorApiConfig.vendor, status: "failed", reason: error.message });
    }
  }

  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");

  console.log("Payment methods refresh complete:\n");
  for (const result of results) {
    if (result.status === "ok") {
      console.log(`  OK      ${result.vendor}: ${result.methods.length ? result.methods.join(", ") : "(none enabled)"}`);
    } else if (result.status === "skipped") {
      console.log(`  SKIPPED ${result.vendor}: ${result.reason}`);
    } else {
      console.log(`  FAILED  ${result.vendor}: ${result.reason}`);
    }
  }
  console.log("\nInstant Peptides and LabSourced Peptides were not touched (custom API, no payment_gateways endpoint). Update those manually if needed.");

  const failures = results.filter(r => r.status === "failed");
  if (failures.length) {
    console.error(`\n${failures.length} vendor(s) failed. Check credentials and re-run.`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error("Payment methods refresh failed:", error);
  process.exitCode = 1;
});
