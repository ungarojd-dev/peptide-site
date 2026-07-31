// Rewrites the vendor dropdowns in admin/config.yml from data/vendor-config.json.
//
// Why this exists: Aurora Peptides was added as the 16th vendor with a config
// entry, an adapter, env vars and an announcement, but the Deals collection's
// vendor list is a hand-maintained array in config.yml and was missed. The
// result is a vendor that exists everywhere except the one place someone needs
// it, and it fails silently because a missing dropdown option looks like a
// design decision rather than a bug.
//
// Runs in the deploy chain, so adding vendor 17 to vendor-config.json is enough.
//
// The lists are replaced between explicit marker comments rather than by parsing
// YAML, so nothing else in the file can be disturbed.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const W = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = `${W}/admin/config.yml`;

const vendorConfig = JSON.parse(await readFile(`${W}/data/vendor-config.json`, "utf8"));
const vendors = Object.keys(vendorConfig.vendors || {}).sort((a, b) => a.localeCompare(b));

// Non-vendor entries that also need to be selectable, per collection.
const EXTRAS = {
  deals: ["SammyC's Skool"],
  giveaways: ["MyPeptidePrice", "SammyC"]
};

function block(names, indent) {
  return names.map(name => `${indent}- ${JSON.stringify(name)}`).join("\n");
}

let source = await readFile(CONFIG, "utf8");
let replaced = 0;

for (const [collection, extras] of Object.entries(EXTRAS)) {
  const open = `# VENDOR-OPTIONS-START:${collection}`;
  const close = `# VENDOR-OPTIONS-END:${collection}`;
  const start = source.indexOf(open);
  const end = source.indexOf(close);
  if (start === -1 || end === -1) {
    console.warn(`  sync-cms-vendors: markers missing for "${collection}", left untouched`);
    continue;
  }
  // Preserve the indentation the marker line sits at.
  const lineStart = source.lastIndexOf("\n", start) + 1;
  const indent = source.slice(lineStart, start);
  const names = collection === "giveaways" ? [...extras, ...vendors] : [...vendors, ...extras];
  const body = `${open}\n${block(names, indent)}\n${indent}${close}`;
  source = source.slice(0, start) + body + source.slice(end + close.length);
  replaced += 1;
  console.log(`  ${collection}: ${names.length} options (${vendors.length} vendors + ${extras.length} extra)`);
}

if (replaced) {
  await writeFile(CONFIG, source);
  console.log(`sync-cms-vendors: updated ${replaced} dropdown(s) in admin/config.yml`);
} else {
  console.warn("sync-cms-vendors: nothing updated, check the marker comments in admin/config.yml");
}
