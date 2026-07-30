// Expands the human-edited data/giveaways.json into data/giveaways-public.json.
//
// Mirrors build-promotions.mjs: the admin portal writes a friendly shape, this
// validates it and emits what the site reads. Catching a bad date or a missing
// entry link here means it shows up in the deploy log rather than as an empty
// panel on the live site.
//
// Live/upcoming/ended status is deliberately NOT baked in. It is computed in the
// browser from the dates, so a giveaway ends on time without needing a redeploy.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const W = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const source = JSON.parse(await readFile(`${W}/data/giveaways.json`, "utf8"));
const entries = Array.isArray(source.giveaways) ? source.giveaways : [];

const errors = [];
const warnings = [];
const slug = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const clean = value => String(value == null ? "" : value).trim();

// Same date convention as deals: a plain YYYY-MM-DD in the host's timezone.
// End date is inclusive, so a giveaway ending "2026-08-15" runs through that day.
function isoDate(value, field, label) {
  const text = clean(value);
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) {
    errors.push(`${label}: ${field} should look like 2026-08-15, got "${text}"`);
    return "";
  }
  return text.slice(0, 10);
}

function expand(entry, index) {
  const title = clean(entry.title);
  const label = title || `giveaway #${index + 1}`;
  if (!title) { errors.push(`${label}: needs a title`); return null; }

  const start = isoDate(entry.start_date, "start_date", label);
  const end = isoDate(entry.end_date, "end_date", label);
  if (!start) errors.push(`${label}: needs a start date`);
  if (!end) errors.push(`${label}: needs an end date`);
  if (start && end && end < start) errors.push(`${label}: end date is before the start date`);

  const entryUrl = clean(entry.entry_url);
  if (!entryUrl) errors.push(`${label}: needs an entry link, otherwise the button goes nowhere`);
  else if (!/^https?:\/\//i.test(entryUrl)) errors.push(`${label}: entry link must start with https://`);

  const rulesUrl = clean(entry.rules_url);
  if (rulesUrl && !/^https?:\/\//i.test(rulesUrl)) errors.push(`${label}: rules link must start with https://`);
  if (!rulesUrl) warnings.push(`${label}: no rules link set`);

  const host = clean(entry.host) || "MyPeptidePrice";

  return {
    id: clean(entry.id) || slug(`${host}-${title}`) || `giveaway-${index + 1}`,
    title,
    host,
    // Partner giveaways get the vendor's name; anything hosted in-house reads as
    // MyPeptidePrice so a visitor can tell whose promotion it is.
    is_partner: host.toLowerCase() !== "mypeptideprice",
    description: clean(entry.description),
    prize: clean(entry.prize),
    start_date: start,
    end_date: end,
    timezone: clean(entry.timezone) || "America/New_York",
    entry_url: entryUrl,
    cta_text: clean(entry.cta_text) || "Enter now",
    rules_url: rulesUrl,
    image: clean(entry.image),
    featured: entry.featured === true
  };
}

const giveaways = entries.map(expand).filter(Boolean);

if (errors.length) {
  console.error("\nbuild-giveaways: giveaways.json has problems:\n");
  for (const error of errors) console.error(`  - ${error}`);
  console.error("\nFix these in the admin portal at /admin. Nothing was written.\n");
  process.exit(1);
}

for (const warning of warnings) console.warn(`  build-giveaways warning: ${warning}`);

await writeFile(
  `${W}/data/giveaways-public.json`,
  `${JSON.stringify({ version: clean(source.version) || new Date().toISOString().slice(0, 10), giveaways }, null, 2)}\n`
);

const partners = giveaways.filter(g => g.is_partner).length;
console.log(`Expanded ${entries.length} giveaways into ${giveaways.length} (${partners} partner-hosted).`);
