// Renders a social graphic of the live deals, straight from data/deals.json.
//
// Built from the data rather than typed by hand for the same reason the email
// is: a graphic that disagrees with the board is worse than no graphic, and
// nobody is going to re-check fourteen percentages against the site before
// posting. The house rules apply here too. The sale and the code are always
// two separate figures, never a combined one, and every date is read off the
// authored calendar string rather than through a Date object.
//
// Usage:
//   node scripts/build-social-card.mjs
//   node scripts/build-social-card.mjs --date 2026-09-04 --out social/labor-day.png
//
// Writes a 1600x900 HTML file, which is the 16:9 X renders in a timeline
// without cropping. Rendering to PNG is a separate step so the script has no
// browser dependency:
//
//   python3 -c "from playwright.sync_api import sync_playwright as s; \
//     p=s().start(); b=p.chromium.launch(); \
//     g=b.new_page(viewport={'width':1600,'height':900}); \
//     g.goto('file:///abs/path/social/labor-day.html'); g.wait_for_timeout(400); \
//     g.screenshot(path='social/labor-day.png'); b.close(); p.stop()"
//
// Manrope is embedded as base64 from fonts/, so the render does not depend on
// the machine having the brand font installed.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const W = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argOf = n => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1] || null; };

const MONTHS = ["January","February","March","April","May","June","July",
                "August","September","October","November","December"];
const ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function parts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
const ord = iso => { const p = parts(iso); return p ? p.y * 10000 + p.m * 100 + p.d : null; };
const shortDay = iso => { const p = parts(iso); return p ? `${ABBR[p.m - 1]} ${p.d}` : ""; };
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function todayIso() {
  const n = new Date(), pad = x => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

const sendDate = argOf("--date") || todayIso();
const on = ord(sendDate);

const deals = JSON.parse(await readFile(`${W}/data/deals.json`, "utf8")).deals;
const cfg = JSON.parse(await readFile(`${W}/data/vendor-config.json`, "utf8")).vendors || {};

const isOffer = d => (d.show_in || []).includes("deals") &&
  (d.sale_percent != null || d.code_percent != null || d.type === "conditional");
const liveOn = d => {
  const s = ord(d.start_date), e = ord(d.end_date);
  return !(s != null && on < s) && !(e != null && on > e);
};

// One entry per vendor, limited time preferred, same rule the email uses.
const byVendor = new Map();
for (const d of deals.filter(x => isOffer(x) && liveOn(x))) {
  const held = byVendor.get(d.vendor);
  if (!held) { byVendor.set(d.vendor, d); continue; }
  const a = ord(d.end_date) != null, b = ord(held.end_date) != null;
  if (a && !b) byVendor.set(d.vendor, d);
  else if (a === b && Number(d.priority || 0) > Number(held.priority || 0)) byVendor.set(d.vendor, d);
}

// Timed offers only. An evergreen veterans discount is not Labor Day news and
// would pad the count with something that is true every other week too.
const live = [...byVendor.values()]
  .filter(d => ord(d.end_date) != null)
  .sort((a, b) => (Number(b.sale_percent || 0) - Number(a.sale_percent || 0)) ||
                  (Number(b.code_percent || 0) - Number(a.code_percent || 0)));

const nameOf = d => (cfg[d.vendor] || {}).display_name || d.display_vendor || d.vendor;

// The rate cell. Two figures, side by side, never summed.
function rate(d) {
  const bits = [];
  if (d.sale_percent != null) bits.push(`<b>${d.sale_percent}%</b> off`);
  if (d.code_percent != null) bits.push(`<b>SAMMYC ${d.code_percent}%</b>`);
  if (!bits.length) bits.push("Bulk offer");
  return bits.join('<span class="dot">+</span>');
}

// The date most offers close on, computed rather than typed.
const tally = new Map();
for (const d of live) tally.set(d.end_date, (tally.get(d.end_date) || 0) + 1);
let closeIso = null, closeN = 0;
for (const [iso, n] of tally) if (n > closeN) { closeIso = iso; closeN = n; }
const majority = closeIso && closeN * 2 > live.length;
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const closeDay = majority
  ? DAYS[new Date(Date.UTC(parts(closeIso).y, parts(closeIso).m - 1, parts(closeIso).d)).getUTCDay()]
  : null;

const b64 = {};
for (const w of [400, 600, 700, 800]) {
  b64[w] = await readFile(`${W}/fonts/manrope-latin-${w}-normal.woff2`, "base64");
}

// Row density scales with the count. Fifteen deals at the spacing that suits
// ten overflows the fixed 900px canvas and silently clips the last row, which
// on a graphic is a mistake nobody catches until it is posted. A rendered
// height check at the end enforces it.
const perCol = Math.ceil(live.length / 2);
const dense = perCol > 7;
const D = dense
  ? { pad: "9px 18px", gap: 7, v: 17, r: 15, h1: 56, mt: 20 }
  : { pad: "13px 20px", gap: 9, v: 19, r: 16, h1: 64, mt: 26 };

const half = perCol;
const col = list => list.map(d => `
  <div class="row">
    <div class="v">${esc(nameOf(d))}</div>
    <div class="r">${rate(d)}</div>
    <div class="e">${esc(shortDay(d.end_date))}</div>
  </div>`).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  ${[400, 600, 700, 800].map(w => `@font-face{font-family:Manrope;font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${b64[w]}) format("woff2");}`).join("\n  ")}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{width:1600px;height:900px;background:#0D0D0D;color:#F7F3EA;
       font-family:Manrope,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden;}
  .wrap{padding:52px 60px 44px;height:900px;display:flex;flex-direction:column;}
  .top{display:flex;align-items:flex-start;justify-content:space-between;}
  .brand{font-weight:800;font-size:30px;letter-spacing:-.6px;}
  .brand span{color:#8C9A61;}
  .kicker{font-weight:700;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#8C9A61;}
  .tag{font-weight:600;font-size:15px;color:#6F766D;margin-top:6px;}
  .badge{border:1px solid #232622;background:#161816;border-radius:999px;
         padding:12px 22px;font-weight:700;font-size:15px;color:#D8C7A7;letter-spacing:.4px;}
  h1{font-weight:800;font-size:${D.h1}px;line-height:1.02;letter-spacing:-2px;margin-top:30px;}
  h1 em{font-style:normal;color:#8C9A61;}
  .sub{font-weight:600;font-size:19px;color:#9AA096;margin-top:12px;}
  .cols{display:flex;gap:24px;margin-top:${D.mt}px;flex:1;}
  .colu{flex:1;display:flex;flex-direction:column;gap:${D.gap}px;}
  .row{background:#161816;border:1px solid #232622;border-radius:14px;
       padding:${D.pad};display:flex;align-items:center;gap:12px;}
  .v{font-weight:800;font-size:${D.v}px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .r{font-weight:600;font-size:${D.r}px;color:#9AA096;white-space:nowrap;}
  .r b{font-weight:800;color:#F7F3EA;}
  .dot{color:#4E5D3C;padding:0 8px;font-weight:700;}
  .e{font-weight:700;font-size:13px;color:#6F766D;letter-spacing:.6px;text-transform:uppercase;
     width:74px;text-align:right;white-space:nowrap;}
  .foot{display:flex;align-items:center;justify-content:space-between;
        border-top:1px solid #232622;padding-top:20px;margin-top:24px;}
  .site{font-weight:800;font-size:22px;}
  .code{font-weight:700;font-size:15px;color:#8C9A61;letter-spacing:.6px;}
  .rule{font-weight:600;font-size:13px;color:#5C625A;letter-spacing:.4px;}
</style></head><body>
<div class="wrap">
  <div class="top">
    <div>
      <div class="kicker">Labor Day weekend</div>
      <div class="brand" style="margin-top:10px">MyPeptidePrice<span>.com</span></div>
      <div class="tag">Live vendor pricing, normalized to cost per mg</div>
    </div>
    <div class="badge">${live.length} sales live</div>
  </div>

  <h1>${closeDay ? `Most of these<br/>end <em>${closeDay}</em>` : `Labor Day sales<br/><em>are live</em>`}</h1>
  <div class="sub">Sale and code shown as separate numbers, the way checkout applies them.</div>

  <div class="cols">
    <div class="colu">${col(live.slice(0, half))}</div>
    <div class="colu">${col(live.slice(half))}</div>
  </div>

  <div class="foot">
    <div class="site">mypeptideprice.com</div>
    <div class="code">Code SAMMYC where supported</div>
    <div class="rule">For laboratory research use only. Not for human consumption.</div>
  </div>
</div>
</body></html>`;

// Guardrails, same as the email. A graphic is harder to correct once posted.
const problems = [];
if (!live.length) problems.push("no live timed deals for this date");
if (html.includes("\u2014")) problems.push("em-dash in output");
for (const m of html.matchAll(/up to \d+% off|\d+% combined/gi)) problems.push(`combined phrasing: ${m[0]}`);
if (!/research use only/i.test(html)) problems.push("research use only line missing");
if (problems.length) {
  console.error("build-social-card: " + problems.join("; "));
  process.exit(1);
}

const outArg = argOf("--out") || `social/labor-day-${sendDate}.html`;
const out = outArg.startsWith("/") ? outArg : `${W}/${outArg}`;
await mkdir(dirname(out), { recursive: true });

await writeFile(out, html);

console.log(`build-social-card: wrote ${outArg}`);
console.log(`  ${live.length} deals, ${closeDay ? `most end ${closeDay}` : "no majority close date"}`);
