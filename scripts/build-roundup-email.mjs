// Builds the weekly roundup email from data/deals.json.
//
// The email is generated rather than written by hand for one reason: every
// house rule about deal copy is a rule a person forgets at 11pm. Stacked
// percentages stated as separate numbers, never combined. No em-dashes. End
// dates read from the authored calendar date rather than reformatted through a
// timezone. Research use only on every send. A script enforces all of that for
// free, and the alternative is a competitor's email that publishes combined
// rates which do not survive checkout.
//
// Usage:
//   node scripts/build-roundup-email.mjs
//   node scripts/build-roundup-email.mjs --date 2026-09-04
//   node scripts/build-roundup-email.mjs --date 2026-09-04 --out email/test.html
//
// Output is a single self-contained HTML file. Paste the whole thing into the
// EmailOctopus campaign under Content, using the "Code your own" editor.
//
// EmailOctopus requires {{UnsubscribeURL}} and {{SenderInfo}} in the footer and
// blocks the send if either is missing. Both are emitted here and must never be
// hand edited. {{SenderInfo}} reads the address from account settings at send
// time, which is what keeps the postal address in one place.

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const W = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://mypeptideprice.com";

// ---------------------------------------------------------------------------
// Palette. Engineered Earth, lifted from site.css so the email cannot drift
// away from the site. Hex only: email clients do not support CSS variables, and
// Outlook ignores anything that is not an inline style on the element itself.
// ---------------------------------------------------------------------------
const C = {
  // Straight from the template. Slightly cooler and darker than the previous
  // set: #0D0F0C page against #171A13 cards, with a deeper olive that reads as
  // an accent rather than as a highlight.
  page:   "#0D0F0C",
  card:   "#171A13",
  line:   "#2E3320",
  cream:  "#F4F1E8",
  olive:  "#6A7929",
  sand:   "#8C9271",
  dim:    "#686E62",
  danger: "#C4452F",
  black:  "#0D0F0C"
};

// Named fonts first for clients that happen to have them, then the web safe
// fallback that actually renders. No webfont import: Gmail strips it and
// Outlook never supported it, so relying on one guarantees an inconsistent
// email rather than a branded one.
const FONT = "'Manrope','Inter',Arial,Helvetica,sans-serif";

// Headings use a serif, and the reason is that email has no web fonts. Asking
// Arial to be a display face by setting it to 800 is what produced the blocky
// look: it is a UI typeface being shouted. Georgia ships on Windows, macOS and
// iOS, needs no loading, and is an actual text face with real contrast, so it
// reads as typography rather than as bold sans. It also sits closer to the
// Playfair Display the site uses than any weight of Arial ever will.
const SERIF = FONT;

const args = process.argv.slice(2);
const argOf = name => {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1] || null;
};

// ---------------------------------------------------------------------------
// Dates.
//
// Everything here works on the authored YYYY-MM-DD string and never builds a
// Date object from it. This is the same bug that made Mile High's end date read
// a day late in the drawer: new Date("2026-09-07") is parsed as UTC midnight,
// so any client west of Greenwich formats it as the 6th. Splitting the string
// cannot drift, because there is no timezone involved at any point.
// ---------------------------------------------------------------------------
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];

function parts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

// Comparable integer, 20260907. Ordering and equality on these is exactly
// ordering and equality on calendar dates, with no clock arithmetic.
function ord(iso) {
  const p = parts(iso);
  return p ? p.y * 10000 + p.m * 100 + p.d : null;
}

function dayLabel(iso) {
  const p = parts(iso);
  return p ? `${MONTHS[p.m - 1]} ${p.d}` : "";
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function weekday(iso) {
  const p = parts(iso);
  if (!p) return "";
  return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
}

function todayIso() {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---------------------------------------------------------------------------
// Escaping. Deal copy is authored in a CMS by a person, so it is treated as
// untrusted for output purposes even though it is ours.
// ---------------------------------------------------------------------------
const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

// Internal links get UTMs so email traffic does not land in GA4 as direct,
// which is the same blind spot the untagged TikTok traffic already has.
// Vendor links deliberately do not: they carry the affiliate ref parameter and
// appending our own analytics junk to a partner URL risks breaking attribution
// on their side, which is the one thing that must not break.
function tagged(url, sendDate) {
  // The fragment has to stay last. Appending the query after a "#compare"
  // anchor put the parameters inside the fragment, which is never sent to the
  // server, so the busiest internal link in the email was untrackable and its
  // campaign never reached GA4 at all.
  const hash = url.indexOf("#");
  const base = hash === -1 ? url : url.slice(0, hash);
  const frag = hash === -1 ? "" : url.slice(hash);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}utm_source=email&utm_medium=newsletter&utm_campaign=roundup-${sendDate}${frag}`;
}

// ---------------------------------------------------------------------------
// Load and select.
// ---------------------------------------------------------------------------
const dealsFile = JSON.parse(await readFile(`${W}/data/deals.json`, "utf8"));
const vendorCfg = JSON.parse(await readFile(`${W}/data/vendor-config.json`, "utf8"));
const vendors = vendorCfg.vendors || {};

const sendDate = argOf("--date") || todayIso();
const sendOrd = ord(sendDate);
if (!sendOrd) {
  console.error(`build-roundup-email: --date must be YYYY-MM-DD, got "${sendDate}"`);
  process.exit(1);
}

// Announcement-only entries are not price events. A community post or a "now
// tracked" note has no offer in it, so including one would pad the count with
// something nobody subscribed to receive.
const isOffer = d =>
  (d.show_in || []).includes("deals") &&
  (d.sale_percent != null || d.code_percent != null || d.type === "conditional");

function liveOn(d, on) {
  const s = ord(d.start_date), e = ord(d.end_date);
  if (s != null && on < s) return false;
  if (e != null && on > e) return false;
  return true;
}

const all = dealsFile.deals.filter(d => isOffer(d) && liveOn(d, sendOrd));

// One card per vendor.
//
// The board can carry two entries for the same vendor without looking wrong,
// because a reader is scanning a table. An email cannot: Solyn's Labor Day sale
// and its standing military discount would read as a mistake, and Coffee shows
// up under two spellings because the evergreen entry authored display_vendor as
// "Coffee & Peppers" while the Labor Day one used "Coffee and Peppers".
//
// Deduping on the internal vendor key rather than the display name is what
// catches that second case. The limited time offer wins, because it is the one
// that expires and therefore the one worth an email. Two timed offers on the
// same vendor fall back to editorial priority.
const byVendor = new Map();
for (const d of all) {
  const key = d.vendor;
  const held = byVendor.get(key);
  if (!held) { byVendor.set(key, d); continue; }
  const dTimed = ord(d.end_date) != null, heldTimed = ord(held.end_date) != null;
  if (dTimed && !heldTimed) { byVendor.set(key, d); continue; }
  if (dTimed === heldTimed && Number(d.priority || 0) > Number(held.priority || 0)) byVendor.set(key, d);
}
const live = [...byVendor.values()];
const suppressed = all.length - live.length;

// Identical promos collapse into one entry.
//
// Glow, Flawless and Iron Protocol run the same sale on the same dates with the
// same copy, so the email printed the same paragraph three times in a row and
// looked like a bug. The popup already groups them into one line. Grouping on
// the offer itself, not on a hand maintained list, means any future shared
// promo groups automatically and a divergence in dates or rate splits them back
// apart on its own.
function offerKey(d) {
  return [d.headline || "", d.sale_percent ?? "", d.code_percent ?? "", d.code || "",
          d.start_date || "", d.end_date || "", d.type || ""].join("|");
}
const groups = new Map();
for (const d of live) {
  const k = offerKey(d);
  if (!groups.has(k)) groups.set(k, { lead: d, members: [] });
  groups.get(k).members.push(d);
}
const entries = [...groups.values()];

// Ranked by the sale rate, then the code rate. Never by the two added together:
// the ordering would then be built on exactly the combined figure the rest of
// this file refuses to print. Editorial priority is the final tiebreak.
function rank(g) {
  return [Number(g.lead.sale_percent || 0), Number(g.lead.code_percent || 0), Number(g.lead.priority || 0)];
}
function byRank(a, b) {
  const x = rank(a), y = rank(b);
  return (y[0] - x[0]) || (y[1] - x[1]) || (y[2] - x[2]);
}

// Everything looking equally important is the same as nothing looking
// important. The strongest few get the full card, the rest get one line each,
// which halves the height and tells the eye where to land.
const FEATURED = 3;
const timedGroups = entries.filter(g => ord(g.lead.end_date) != null).sort(byRank);
const ongoingGroups = entries.filter(g => ord(g.lead.end_date) == null).sort(byRank);
const featured = timedGroups.slice(0, FEATURED);
// Below the fold the deadline matters more than the rate, so the remainder
// sorts by what expires first rather than by what is biggest.
const rest = timedGroups.slice(FEATURED)
  .sort((a, b) => (ord(a.lead.end_date) - ord(b.lead.end_date)) || byRank(a, b));

const timed = timedGroups.map(g => g.lead);
const ongoing = ongoingGroups.map(g => g.lead);

// Counted on the vendor key for the same reason the dedupe is: two spellings
// of one vendor must not read as two vendors.
const vendorCount = new Set(live.map(d => d.vendor)).size;

// ---------------------------------------------------------------------------
// Compare links. Every deal gets two exits: one to the vendor, which earns,
// and one back to a page we own, which is the half a pure affiliate blast
// throws away. Falls back to the comparison anchor for vendors that have no
// page yet rather than linking to a 404.
// ---------------------------------------------------------------------------
async function compareUrl(deal) {
  const cfg = vendors[deal.vendor];
  // The vendor pages are generated and currently stale, so the destination is
  // the live catalog pre-filtered to this vendor instead. ?vendor= resolves
  // against the loaded catalog and falls back to the full list if the vendor
  // is not in it, so a bad slug can never produce an empty page.
  if (cfg && cfg.id) return `${SITE}/?vendor=${cfg.id}`;
  return `${SITE}/`;
}

// ---------------------------------------------------------------------------
// Rendering.
//
// Tables and inline styles throughout. Outlook renders through Word, which
// supports neither flexbox nor grid nor a <style> block reliably, so anything
// structural has to be a table cell with a width on it.
//
// Vendor logos are referenced from the live site by absolute URL. They are
// .webp, which Gmail, Apple Mail and Yahoo render and which Outlook on Windows
// does not, and every client blocks remote images by default until a sender is
// trusted. This domain has been sending for two days, so the common case on a
// first open is no image at all.
//
// The design therefore never depends on the image. The logo carries alt text
// styled to look exactly like the vendor name heading it replaces, so a
// blocked, unsupported or missing file degrades to clean type rather than a
// broken icon. Colour on the row comes from the brand coloured rate badge,
// which is CSS and always renders, so a row with images off still reads as
// designed rather than as a failure.
// ---------------------------------------------------------------------------

// Logos are served from the live site, not bundled. The width attribute is set
// and the height deliberately is not: the two lockups in the repo are 420x160,
// but any vendor whose file is a different shape will then scale
// proportionally instead of being squashed into an assumed ratio. Outlook
// scales from the width attribute, which is why it is an attribute and not
// only a style.
// Constrained to a box, not to a width. The two files in the repo are 420x160
// wordmarks, but Aurora's is a round badge, so anything sized by width alone
// renders one of them three times the height of the other. max-width and
// max-height together fit any ratio inside the same slot and keep the rows
// even. Both are CSS rather than attributes because the attribute form cannot
// express "whichever limit is hit first".
// Logos are off.
//
// The files are 420x160 wordmarks. Fitting mixed aspect ratios into one even
// slot caps them near 52x20, which is too small to read as anything, and
// several have dark artwork that fights the tinted panel behind it. The first
// live send confirmed it: fourteen rows each spending 44px of height on an
// illegible smudge.
//
// Flip this back on if someone produces square marks at roughly 88px drawn to
// sit on a light background. Everything needed to render them is still here.
const SHOW_LOGOS = false;

// Masthead wordmark. Swap this path if a lockup drawn specifically for a dark
// background gets pushed to the repo, since the header sits on navy.
// A dedicated email lockup with the dark plate baked into the PNG.
//
// The site lockup is white type on transparent, drawn for a dark page. Gmail's
// mobile apps ignore color-scheme and the !important overrides and run their
// own colour transform, so a dark email can arrive rendered light. On a cream
// panel the white wordmark simply disappears, which is what happened in the
// inbox. A client can invert a background colour declared in CSS; it cannot
// repaint the inside of an image, so the backdrop travels with the logo.
const BRAND_LOCKUP = "/assets/brand/logo-email.png";
const LOCKUP_W = 240;
const SLOT_W = 64;
const SLOT_H = 44;
const LOGO_W = 52;
const LOGO_H = 32;
function logoUrl(meta) {
  if (!meta || !meta.logo) return null;
  return SITE + (meta.logo.startsWith("/") ? meta.logo : `/${meta.logo}`);
}


// The headline figure for the brand pill. Deliberately one number, never a sum.
// A conditional offer has no single percentage that is true, so it says so
// instead of inventing one.
function badge(d) {
  if (d.sale_percent != null) return `${d.sale_percent}% off`;
  if (d.code_percent != null) return `${d.code_percent}% code`;
  // Nothing here is a single true number. An eligibility discount like the
  // veterans rate is not sitewide and not everyone qualifies, so any figure in
  // the badge would overstate it for most readers. The headline already says
  // what the offer is, so the badge is simply left off.
  return null;
}

// The detail block. This function is the whole reason the generator exists:
// there is no code path here that adds two percentages together, so a combined
// rate cannot reach a subscriber even when a vendor's own graphic advertises
// one.
//
// Labelled rows rather than a run-on sentence. Sale, Code, Starts and Ends
// always appear in that order and always in the same column, so a reader
// comparing two cards is comparing the same position on both. Rows that do not
// apply are omitted rather than filled with a dash, and the label column is a
// fixed width so nothing shifts between cards.
// Days since a deal opened, or null if it has no start date. Computed in UTC
// off the authored calendar strings, same as everything else in this file.
function daysSinceStart(d) {
  const p = parts(d.start_date), q = parts(sendDate);
  if (!p || !q) return null;
  return Math.round((Date.UTC(q.y, q.m - 1, q.d) - Date.UTC(p.y, p.m - 1, p.d)) / 86400000);
}
const NEW_FOR_DAYS = 2;

// --since YYYY-MM-DD marks anything that opened on or after that date as new.
// Pass the date of the previous send and the New section means what a reader
// assumes it means: what changed since the last one they got. Without it, the
// fallback is a two day window, which is only right if you send daily.
const sinceArg = argOf("--since");
const sinceOrd = sinceArg ? ord(sinceArg) : null;
if (sinceArg && !sinceOrd) {
  console.error(`build-roundup-email: --since must be YYYY-MM-DD, got "${sinceArg}"`);
  process.exit(1);
}

function isNew(d) {
  if (sinceOrd) {
    const s = ord(d.start_date);
    if (s == null || s < sinceOrd || s > sendOrd) return false;
    return !urgency(d);
  }
  const n = daysSinceStart(d);
  if (n === null || n < 0 || n > NEW_FOR_DAYS) return false;
  // A short run can be both freshly started and closing tonight. Carrying NEW
  // next to a deadline flag reads as a contradiction, and the deadline is the
  // more useful signal, so the star stands down.
  return !urgency(d);
}

function urgency(d) {
  const e = ord(d.end_date);
  if (e == null) return "";
  if (e === sendOrd) return "Ends today";
  const p = parts(d.end_date), q = parts(sendDate);
  // Whole days between two calendar dates, computed in UTC so that neither the
  // build machine's clock nor daylight saving can move the answer.
  const days = Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(q.y, q.m - 1, q.d)) / 86400000);
  if (days === 1) return "Ends tomorrow";
  if (days <= 3) return `${days} days left`;
  return "";
}

// The date most of the limited time deals close on. Computed rather than typed,
// so the copy can never claim a deadline the board does not have.
const endTally = new Map();
for (const d of timed) {
  const e = ord(d.end_date);
  if (e != null) endTally.set(d.end_date, (endTally.get(d.end_date) || 0) + 1);
}
// Highest count wins, and on a tie the earliest date wins. Without the
// tiebreak the tally kept whichever date it happened to hit first, which
// follows the rank sort rather than the calendar and buried the nearer
// deadline behind a later one.
let closeDate = null, closeCount = 0;
for (const [iso, n] of endTally) {
  if (n > closeCount || (n === closeCount && closeDate && ord(iso) < ord(closeDate))) {
    closeDate = iso; closeCount = n;
  }
}
// Measured against every deal in the email, not just the timed ones. Two of
// three timed offers is a majority of the timed set but only two of seven
// deals shown, and "most of these end tomorrow" printed above five that do not
// is simply false to the reader.
const majorityCloses = closeDate && closeCount * 2 > live.length;
const allClose = closeDate && closeCount === live.length;
const someClose = closeDate && closeCount > 0;
const daysOut = closeDate && someClose
  ? Math.round((Date.UTC(parts(closeDate).y, parts(closeDate).m - 1, parts(closeDate).d)
              - Date.UTC(parts(sendDate).y, parts(sendDate).m - 1, parts(sendDate).d)) / 86400000)
  : null;
// On the closing day itself, naming the weekday is the weakest possible
// phrasing: "ends Wednesday" read on Wednesday morning sounds like a future
// date. Same day becomes "tonight", the day before becomes "tomorrow".
const closeDay = !someClose ? null
  : daysOut === 0 ? "tonight"
  : daysOut === 1 ? "tomorrow"
  : weekday(closeDate);

// Verb agreement and small numbers spelled out. "1 end Sunday" was both
// ungrammatical and hard to parse next to another numeral in the same line.
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const countWord = n => (n <= 10 ? WORDS[n] : String(n));
const endsVerb = n => (n === 1 ? "ends" : "end");

const closePhrase = !closeDay ? null
  : allClose ? `All of these end ${closeDay}`
  : majorityCloses ? `Most of these end ${closeDay}`
  : closeCount === 1 ? `One of these ends ${closeDay}`
  : `${countWord(closeCount)} of these end ${closeDay}`;
const closeShort = !closeDay ? null
  : allClose ? `all end ${closeDay}`
  : majorityCloses ? `most end ${closeDay}`
  : `${countWord(closeCount)} ${endsVerb(closeCount)} ${closeDay}`;

const THEMES = {
  default: {
    eyebrow: "Price alerts",
    headerBg: C.panel2,
    footerBg: C.forest2,
    accent: C.oliveSoft,
    urgent: C.danger,
    bunting: null,
    title: d => dayLabel(d),
    intro: "Sale and code shown as separate numbers, the way checkout applies them.",
    count: () => live.length === 1
      ? "1 sale live right now"
      : `${live.length} sales live right now across ${vendorCount} vendor${vendorCount === 1 ? "" : "s"}`,
    ongoingLabel: "Ongoing",
    subject: line => `${line.charAt(0).toUpperCase()}${line.slice(1)}`,
    preheader: "Every tracked vendor, normalized to cost per mg, with the sale and the code stated separately."
  },
  "labor-day": {
    eyebrow: "Labor Day sales",
    headerBg: C.panel2,
    footerBg: C.forest2,
    accent: C.oliveSoft,
    urgent: C.danger,
    bunting: ["#B23A34", C.cream, "#2F4B7C"],
    // The headline carries the deadline and the line under it carries the
    // scale, so neither repeats the other or the subject line.
    title: () => "Last minute Labor Day deals",
    // The count line sits directly above this, so repeating the vendor number
    // here just reads as a stutter.
    intro: `${closeShort ? `${closeShort.charAt(0).toUpperCase()}${closeShort.slice(1)}${/tonight|tomorrow/.test(closeDay) ? "" : " night"}. ` : ""}Sale and code shown as separate numbers, the way checkout applies them.`,
    count: () => {
      const a = `${timed.length} Labor Day sale${timed.length === 1 ? "" : "s"} still live`;
      const b = ongoingGroups.length
        ? `, plus ${ongoingGroups.length} standing offer${ongoingGroups.length === 1 ? "" : "s"}`
        : "";
      return a + b;
    },
    // Named so nobody reads the second block as part of the event.
    ongoingLabel: "Standing offers, not Labor Day",
    subject: () => closeShort ? `Last minute Labor Day deals, ${closeShort}` : "Last minute Labor Day deals still live",
    preheader: `${timed.length} Labor Day sale${timed.length === 1 ? "" : "s"} still live${closeShort ? `. ${closeShort.charAt(0).toUpperCase()}${closeShort.slice(1)}` : ""}.`
  }
};

// Theme selection. The flag wins. Without one, a send where most of the live
// deals are named for the same event picks that event's theme, so the weekly
// run does not depend on remembering to pass it.
const themeArg = argOf("--theme");
const laborish = live.filter(d => /labor day/i.test(`${d.headline || ""} ${d.description || ""}`)).length;
const themeKey = themeArg || (laborish * 2 > live.length ? "labor-day" : "default");
const T = THEMES[themeKey] || THEMES.default;
if (themeArg && !THEMES[themeArg]) {
  console.error(`build-roundup-email: unknown theme "${themeArg}", expected one of ${Object.keys(THEMES).join(", ")}`);
  process.exit(1);
}


// ---------------------------------------------------------------------------
// Table layout.
//
// One row per offer, three columns, a real header row. Cards gave each deal a
// lot of vertical space and made scanning eight of them a scroll; a table puts
// every rate in the same column so they can be read down rather than hunted
// for. Both exits survive: the vendor name is the affiliate link and the
// compare link sits under it, so nothing that earns is lost to the layout.
//
// Still tables all the way down, as email requires, but now the table means
// something instead of only being a positioning device.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Rendering.
//
// Two tiers, matching the template. Anything that opened in the last two days
// gets a full card under NEW TODAY; everything else is a hairline row under
// OTHER ACTIVE OFFERS. The split is the point: a reader who opens this weekly
// should be able to see what changed since the last one without reading the
// whole list.
//
// The offer figure sits in its own right hand column so the rates line up down
// the page, and the sale and the code stay separate elements, never summed.
// ---------------------------------------------------------------------------
// Per vendor brand colour, from vendor-config. Used as an accent rail and on
// the code chip so each block carries the vendor's identity.
//
// Text on the chip is picked from the colour's brightness, not fixed: three
// vendors use the pale sand #d8c7a7, and cream on sand is unreadable. Standard
// relative luminance, same threshold browsers use.
function brandOf(d) {
  const m = vendors[d.vendor] || {};
  return /^#[0-9a-fA-F]{6}$/.test(m.brand_color || "") ? m.brand_color : C.olive;
}
function readableOn(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return C.cream;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.45 ? C.page : C.cream;
}

const nameOf = x => {
  const m = vendors[x.vendor] || {};
  return m.display_name || x.display_vendor || x.vendor;
};

function joinNames(members) {
  const names = members.map(nameOf);
  return names.length === 1 ? names[0] : names.join(" + ");
}

// The window label above each offer. Both dates when both exist, so a reader
// can tell a sale that just opened from one that has been running for weeks.
function windowLabel(d) {
  const s = d.start_date ? dayLabel(d.start_date) : "";
  const e = d.end_date ? dayLabel(d.end_date) : "";
  if (s && e) return `${s} to ${e}`;
  if (e) return `Until ${e}`;
  if (s) return `Started ${s} &bull; Ongoing`;
  return "Ongoing &bull; no end date listed";
}

// The right hand figure. One number and one chip, never a total.
function offerCell(d, big) {
  const brand = brandOf(d);
  const chipInk = readableOn(brand);
  const size = big ? 19 : 14;
  const chipSize = big ? 9 : 8;
  const chipPad = big ? "7px 10px" : "6px 9px";
  const parts = [];
  if (d.sale_percent != null) {
    parts.push(`<span class="cream" style="font:800 ${size}px/1 ${FONT};color:${C.cream};vertical-align:middle;">${d.sale_percent}% OFF</span>`);
    if (d.sale_code) parts.push(`<span style="display:inline-block;background:${brand};color:${chipInk};font:800 ${chipSize}px/1 ${FONT};letter-spacing:.5px;padding:${chipPad};border-radius:999px;margin-left:6px;vertical-align:middle;">${esc(d.sale_code)}</span>`);
    if (d.code_percent != null) parts.push(`<div class="sand" style="font:700 ${chipSize + 1}px/1.5 ${FONT};color:${C.sand};padding-top:6px;">then ${esc(d.code || "SAMMYC")} ${d.code_percent}%</div>`);
  } else if (d.code_percent != null) {
    parts.push(`<span class="cream" style="font:800 ${size}px/1 ${FONT};color:${C.cream};vertical-align:middle;">${d.code_percent}% OFF</span>`);
    parts.push(`<span style="display:inline-block;background:${brand};color:${chipInk};font:800 ${chipSize}px/1 ${FONT};letter-spacing:.5px;padding:${chipPad};border-radius:999px;margin-left:6px;vertical-align:middle;">${esc(d.code || "SAMMYC")}</span>`);
  } else {
    // A quantity or eligibility offer has no single true figure, so the column
    // says what it is rather than inventing a percentage.
    parts.push(`<span class="sand" style="font:700 11px/1.4 ${FONT};color:${C.sand};">See terms</span>`);
  }
  return parts.join("");
}

async function bigCard(g, lastOne) {
  const d = g.lead;
  const link = esc(tagged((await compareUrl(d)) + "#compare", sendDate));
  const shop = g.members.filter(m => m.affiliate_url);
  return `
<tr><td class="page pad" style="background:${C.page};padding:0 22px ${lastOne ? 18 : 7}px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="card" style="background:${C.card};border:1px solid ${C.line};border-radius:9px;">
<tr>
<td width="5" bgcolor="${brandOf(d)}" style="width:5px;background:${brandOf(d)};font-size:0;line-height:0;">&nbsp;</td>
<td style="padding:13px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr class="stack">
<td valign="top">
<div class="cream" style="font:800 15px/1.25 ${FONT};color:${C.cream};">${esc(joinNames(g.members))}</div>
<div class="sand" style="font:700 9px/1.4 ${FONT};color:${C.sand};padding-top:3px;text-transform:uppercase;letter-spacing:.5px;">${windowLabel(d)}${urgency(d) ? ` &bull; <span style="color:${C.danger};">${esc(urgency(d))}</span>` : ""}</div>
<div class="sand" style="font:400 10px/1.45 ${FONT};color:${C.sand};padding-top:5px;">${esc(d.description || d.headline || "")}</div>
</td>
<td width="185" valign="top" align="right" class="offerRight" style="padding-left:10px;">${offerCell(d, true)}</td>
</tr></table>
<div style="padding-top:8px;">${shop.map(m =>
  `<a href="${esc(m.affiliate_url)}" target="_blank" rel="nofollow sponsored noopener" style="font:700 10px/1 ${FONT};color:${C.cream};text-decoration:underline;margin-right:14px;">Shop ${esc(nameOf(m))}</a>`
).join("")}<a href="${link}" target="_blank" style="font:700 10px/1 ${FONT};color:${C.olive};text-decoration:underline;">Compare $/mg</a></div>
</td></tr>
</table>
</td></tr>`;
}

async function smallRow(g) {
  const d = g.lead;
  const link = esc(tagged((await compareUrl(d)) + "#compare", sendDate));
  const shop = g.members.filter(m => m.affiliate_url);
  return `
<tr><td style="padding:13px 0;border-bottom:1px solid ${C.line};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr class="stack">
<td valign="top">
<div style="font:0/0 ${FONT};padding:0 0 6px 0;"><span style="display:inline-block;width:26px;height:3px;background:${brandOf(d)};border-radius:2px;">&nbsp;</span></div>
<div class="cream" style="font:700 13px/1.3 ${FONT};color:${C.cream};">${esc(joinNames(g.members))}</div>
<div class="sand" style="font:700 9px/1.4 ${FONT};color:${C.sand};padding-top:3px;text-transform:uppercase;letter-spacing:.5px;">${windowLabel(d)}${urgency(d) ? ` &bull; <span style="color:${C.danger};">${esc(urgency(d))}</span>` : ""}</div>
<div class="sand" style="font:400 10px/1.45 ${FONT};color:${C.sand};padding-top:5px;">${esc(d.headline || "")}</div>
<div style="padding-top:6px;">${shop.map(m =>
  `<a href="${esc(m.affiliate_url)}" target="_blank" rel="nofollow sponsored noopener" style="font:700 9px/1 ${FONT};color:${C.cream};text-decoration:underline;margin-right:12px;">Shop ${esc(nameOf(m))}</a>`
).join("")}<a href="${link}" target="_blank" style="font:700 9px/1 ${FONT};color:${C.olive};text-decoration:underline;">Compare $/mg</a></div>
</td>
<td width="175" align="right" valign="top" class="offerRight" style="padding-left:12px;">${offerCell(d, false)}</td>
</tr></table>
</td></tr>`;
}

function sectionLabel(text) {
  return `
<tr><td class="page pad" style="background:${C.page};padding:0 22px 8px;">
<div class="cream" style="font:800 11px/1 ${FONT};color:${C.cream};">${esc(text)}</div>
</td></tr>`;
}

// New first, then everything else. When nothing is new the section disappears
// entirely rather than printing an empty heading.
const allGroups = [...featured, ...rest, ...ongoingGroups];
const freshGroups = allGroups.filter(g => isNew(g.lead));
const otherGroups = allGroups.filter(g => !isNew(g.lead));

// "New today" is only true on the day something opens. The fresh window runs
// two days, so on day two the heading has to stop claiming otherwise.
// "New today" only when something genuinely opened today. Otherwise plain
// "New", which is accurate whether it opened this morning or last week and has
// not been sent yet.
const freshToday = freshGroups.some(g => daysSinceStart(g.lead) === 0);
const freshLabel = freshToday ? "New today" : "New";

const freshHtml = freshGroups.length
  ? sectionLabel(freshLabel) + (await Promise.all(freshGroups.map((g, i) => bigCard(g, i === freshGroups.length - 1)))).join("")
  : "";
const otherHtml = otherGroups.length
  ? sectionLabel(freshGroups.length ? "Other active offers" : "Live now") + `
<tr><td class="page pad" style="background:${C.page};padding:0 22px 19px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.line};">
${(await Promise.all(otherGroups.map(smallRow))).join("")}
</table>
</td></tr>`
  : "";

const countLine = T.count();

// One announcement slot, rendered above the deals.
//
// Partner colours are optional: bg, border, accent, ctaBg and ctaInk all fall
// back to the site palette when a campaign does not set them. Set to null to
// omit the block entirely.
// Off for this send. The kit went live on September 10, so a panel labelled
// NEW was claiming novelty it no longer had while the genuinely new item sat
// below it. The kit is still listed in the active offers, which is where a
// week old promo belongs.
//
// To turn it back on for a real launch, uncomment and fill in all five fields.
// Partner colours are optional: bg, border, accent, ctaBg and ctaInk fall back
// to the site palette when unset.
// The highlight panel, rendered below the New section rather than above it.
// Above, it competed with whatever was actually new; below, it reads as the
// thing worth a second look once the news is out of the way.
//
// Label is deliberately not "New". The kit went live on September 10, and a
// panel claiming novelty it no longer has is the thing that made it read wrong
// at the top. Partner colours are optional and fall back to the site palette.
const ANNOUNCEMENT = {
  label: "Spotlight",
  heading: "Build your own kit at Coffee & Peppers",
  body: "Pick any 5 or 10 eligible single vials and mix them however you like. A half kit of 5 saves 5%, a full kit of 10 saves 15%, and the discount applies automatically at checkout. Code SAMMYC stacks for a further 15% off the reduced price. 57 singles are eligible and the offer has no end date.",
  cta: "Build a kit",
  bg: "#2A1410",
  border: "#8A3B1E",
  accent: "#FF6B35",
  ctaBg: "#D9391C",
  ctaInk: "#FFFFFF",
  // Vendor destination, so no UTMs appended. The affiliate coupon is the only
  // parameter that belongs on it.
  url: "https://coffeeandpeppers.com/build-your-own-kit/?coupon=sammyc"
};

// The hero headline leads with the story, not the inventory.
//
// "7 sales live, one ends Sunday" is true and says nothing worth opening for.
// The lead is whatever is new, falling back to the strongest timed offer, and
// the sentence is built from that deal's own figures so it can never claim
// something the table below does not show. The count moves down to the small
// line, where it belongs as context rather than as the pitch.
const leadGroup = freshGroups[0] || featured[0] || allGroups[0] || null;

function headlineFor(g) {
  if (!g) return `${live.length} sale${live.length === 1 ? "" : "s"} live today`;
  const d = g.lead;
  const who = joinNames(g.members);
  if (d.sale_percent != null) {
    return d.sale_code
      ? `${d.sale_percent}% off at ${who} with ${d.sale_code}`
      : `${d.sale_percent}% off at ${who}`;
  }
  if (d.code_percent != null) {
    // A boosted code is the offer, so the code is the subject of the sentence.
    return `${d.code || "SAMMYC"} is ${d.code_percent}% off at ${who}`;
  }
  return `New at ${who}`;
}

const heroLine = headlineFor(leadGroup);

// The count and the nearest deadline drop to the supporting line.
const contextLine = closeShort
  ? `${live.length} sales live, ${closeShort}. ${T.intro}`
  : `${live.length} sale${live.length === 1 ? "" : "s"} live. ${T.intro}`;

const subject = T.subject(countLine);
const preheader = T.preheader;

const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="dark light"/>
<meta name="supported-color-schemes" content="dark light"/>
<title>MyPeptidePrice Price Alert</title>
<style type="text/css">
:root{color-scheme:dark light;supported-color-schemes:dark light}
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
table{border-collapse:collapse!important}
img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
body{margin:0!important;padding:0!important;width:100%!important}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
@media only screen and (max-width:600px){
 .outer{padding:0!important}.shell{width:100%!important}
 .pad{padding-left:18px!important;padding-right:18px!important}
 .hero{font-size:31px!important}
 .stack,.stack td{display:block!important;width:100%!important;box-sizing:border-box!important}
 .offerRight{text-align:left!important;padding-left:0!important;padding-top:8px!important}
 .btn{display:block!important;text-align:center!important}
}
[data-ogsb] .page{background:${C.page}!important}
[data-ogsb] .card{background:${C.card}!important}
[data-ogsc] .cream{color:${C.cream}!important}
[data-ogsc] .olive{color:${C.olive}!important}
[data-ogsc] .sand{color:${C.sand}!important}
@media(prefers-color-scheme:dark){
 .page{background:${C.page}!important}.card{background:${C.card}!important}
 .cream{color:${C.cream}!important}.olive{color:${C.olive}!important}.sand{color:${C.sand}!important}
}
</style>
</head>
<body class="page" style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.page};opacity:0;">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page" style="background:${C.page};">
<tr><td align="center" class="outer" style="padding:18px 10px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" class="shell" style="width:100%;max-width:560px;">

<tr><td class="page pad" style="background:${C.page};padding:18px 22px 16px;border-bottom:1px solid ${C.line};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td>
<img src="${SITE}${BRAND_LOCKUP}" width="220" alt="MyPeptidePrice.com" style="display:block;width:100%;max-width:220px;height:auto;color:${C.cream};font:800 21px ${FONT};"/>
<div class="sand" style="font:400 10px/1.4 ${FONT};color:${C.sand};padding-top:6px;">Independent price comparison. We list vendor prices, we do not sell.</div>
</td>
<td align="right" class="sand" style="font:700 9px/1.4 ${FONT};color:${C.sand};text-transform:uppercase;letter-spacing:1.2px;white-space:nowrap;">${esc(dayLabel(sendDate).toUpperCase())}</td>
</tr></table>
</td></tr>

<tr><td class="page pad" style="background:${C.page};padding:24px 22px 20px;">
<div class="olive" style="font:800 9px/1 ${FONT};color:${C.olive};text-transform:uppercase;letter-spacing:1.6px;">${esc(T.eyebrow)}</div>
<div class="cream hero" style="font:800 36px/1.05 ${FONT};color:${C.cream};letter-spacing:-1px;padding-top:8px;">${esc(heroLine)}</div>
<div class="sand" style="font:400 13px/1.55 ${FONT};color:${C.sand};padding-top:8px;">${esc(contextLine)}</div>
</td></tr>



${freshHtml}
${ANNOUNCEMENT ? `<tr><td class="page pad" style="background:${C.page};padding:0 22px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${ANNOUNCEMENT.bg || C.card}" class="card" style="background:${ANNOUNCEMENT.bg || C.card};border:1px solid ${ANNOUNCEMENT.border || C.line};border-radius:9px;">
<tr>
<td width="5" bgcolor="${ANNOUNCEMENT.accent || C.olive}" style="width:5px;background:${ANNOUNCEMENT.accent || C.olive};font-size:0;line-height:0;">&nbsp;</td>
<td style="padding:14px 16px;">
<div style="font:800 9px/1 ${FONT};color:${ANNOUNCEMENT.accent || C.olive};text-transform:uppercase;letter-spacing:1.6px;">${esc(ANNOUNCEMENT.label)}</div>
<div class="cream" style="font:800 15px/1.3 ${FONT};color:${C.cream};padding-top:7px;">${esc(ANNOUNCEMENT.heading)}</div>
<div class="sand" style="font:400 11px/1.55 ${FONT};color:${C.sand};padding-top:6px;">${esc(ANNOUNCEMENT.body)}</div>
<div style="padding-top:11px;"><a href="${esc(ANNOUNCEMENT.url)}" target="_blank"${/^https?:\/\/(www\.)?mypeptideprice\.com/i.test(ANNOUNCEMENT.url) ? "" : ' rel="nofollow sponsored noopener"'} style="display:inline-block;background:${ANNOUNCEMENT.ctaBg || C.olive};color:${ANNOUNCEMENT.ctaInk || C.cream};font:800 11px/1 ${FONT};letter-spacing:.4px;text-decoration:none;padding:11px 18px;border-radius:999px;">${esc(ANNOUNCEMENT.cta)} &rsaquo;</a></div>
</td>
</tr>
</table>
</td></tr>` : ""}
${otherHtml}

<tr><td class="page pad" style="background:${C.page};padding:0 22px 21px;">
<a href="${esc(tagged(SITE + "/#compare", sendDate))}" target="_blank" class="btn" style="display:block;background:${C.olive};color:${C.cream};font:800 12px/1 ${FONT};text-align:center;text-decoration:none;padding:14px 18px;border-radius:7px;">Compare live prices</a>
<div class="sand" style="font:700 8px/1.4 ${FONT};color:${C.sand};text-align:center;letter-spacing:1px;text-transform:uppercase;padding-top:9px;">WE DON'T SELL PRODUCTS &nbsp;&bull;&nbsp; WE SHOW PRICES</div>
</td></tr>

<tr><td class="page pad" style="background:${C.page};padding:14px 22px;border-top:1px solid ${C.line};">
<div class="olive" style="font:800 8px/1 ${FONT};color:${C.olive};letter-spacing:1.2px;text-transform:uppercase;">RESEARCH USE ONLY</div>
<div class="sand" style="font:400 9px/1.5 ${FONT};color:${C.sand};padding-top:5px;">Products referenced are offered by third party vendors for laboratory research use only and are not for human consumption. MyPeptidePrice.com does not sell products. Availability, discounts and final checkout pricing are controlled by each vendor and may change without notice.</div>
</td></tr>

<tr><td class="page pad" style="background:${C.page};padding:10px 22px 18px;">
<div style="font:400 9px/1.5 ${FONT};color:${C.dim};">Some outbound vendor links are affiliate links. We may earn a commission if a purchase is made through one, at no additional cost to you.</div>
<div style="font:400 9px/1.5 ${FONT};color:${C.dim};padding-top:5px;">You subscribed to MyPeptidePrice price alerts. <a href="{{UnsubscribeURL}}" style="color:${C.sand};text-decoration:underline;">Unsubscribe</a></div>
<div style="font:400 9px/1.5 ${FONT};color:${C.dim};padding-top:5px;">{{SenderInfo}}</div>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Guardrails. These run on the built output rather than on the source, so they
// catch anything a future template edit introduces as well as anything a CMS
// author typed. A failed check exits non-zero and writes nothing: a send that
// breaks a compliance rule is worse than a send that does not go out.
// ---------------------------------------------------------------------------
const problems = [];

if (!live.length) problems.push("no live deals for this date, there is nothing to send");
if (html.includes("\u2014")) problems.push("em-dash found in output");
if (!html.includes("{{UnsubscribeURL}}")) problems.push("{{UnsubscribeURL}} missing, EmailOctopus will block the send");
if (!html.includes("{{SenderInfo}}")) problems.push("{{SenderInfo}} missing, EmailOctopus will block the send");
if (!/research use only/i.test(html)) problems.push("research use only disclaimer missing");

// Combined stacked rates. Vendors advertise these constantly and they do not
// survive checkout, so they must never reach a subscriber through us.
for (const m of html.matchAll(/up to \d+% off|\d+% combined|combined \d+%/gi)) {
  problems.push(`combined discount phrasing in output: "${m[0]}"`);
}

// A deal with no way to reach the vendor earns nothing and looks broken.
for (const d of live) {
  if (!d.affiliate_url) problems.push(`deal "${d.id}" has no affiliate_url, its card will have no shop link`);
}

// Not a failure, but the signal that there is nothing worth sending. Ongoing
// offers never expire, so a build will always succeed on them alone and the
// list would receive the same evergreen entries forever without complaint.
if (!timed.length) {
  console.warn("build-roundup-email: warning, no limited time deals on this date, only ongoing offers.");
  console.warn("  Consider skipping this send rather than repeating evergreen entries.\n");
}

if (problems.length) {
  console.error(`build-roundup-email: ${problems.length} problem(s), nothing written\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

// Relative paths resolve against the repo root so the default lands in
// email/ regardless of where the script is invoked from. An absolute path is
// honoured as given: joining it to the root instead silently created a
// ./tmp directory inside the repo, which then got committed.
const outArg = argOf("--out") || `email/roundup-${sendDate}.html`;
const out = outArg.startsWith("/") ? outArg : `${W}/${outArg}`;
await mkdir(dirname(out), { recursive: true });
await writeFile(out, html);

console.log(`build-roundup-email: wrote ${outArg}`);
console.log(`  send date     ${sendDate}`);
console.log(`  theme         ${themeKey}${themeArg ? "" : " (auto)"}`);
console.log(`  deals         ${live.length} across ${vendorCount} vendors`);
console.log(`  layout        ${featured.length} featured, ${rest.length} compact, ${ongoingGroups.length} ongoing`);
if (entries.length < live.length) console.log(`  grouped       ${live.length - entries.length} deal(s) folded into a shared offer`);
if (suppressed) console.log(`  suppressed    ${suppressed} duplicate vendor entr${suppressed === 1 ? "y" : "ies"}`);
console.log(`  subject       ${subject}`);
console.log(`  preview text  ${preheader}`);
console.log(`\nPaste the file into the EmailOctopus campaign under Content, "Code your own".`);
