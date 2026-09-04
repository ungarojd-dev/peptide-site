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
  forest: "#1F3A2D",
  forest2: "#294A3A",
  olive: "#4E5D3C",
  cream: "#F7F3EA",
  paper: "#FFFFFF",
  sand: "#D8C7A7",
  sand2: "#f0e5ce",
  stone: "#E3E1DC",
  ink: "#1A1A1A",
  muted: "#66706A",
  danger: "#a4473e"
};

// Named fonts first for clients that happen to have them, then the web safe
// fallback that actually renders. No webfont import: Gmail strips it and
// Outlook never supported it, so relying on one guarantees an inconsistent
// email rather than a branded one.
const FONT = "'Manrope','Inter',Arial,Helvetica,sans-serif";

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
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}utm_source=email&utm_medium=newsletter&utm_campaign=roundup-${sendDate}`;
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

// Limited time first, because those are the ones a reader can miss. Within
// that group, soonest to expire leads. Ongoing offers sort by priority, which
// is the editorial ordering the board already uses.
const timed = live.filter(d => ord(d.end_date) != null)
  .sort((a, b) => (ord(a.end_date) - ord(b.end_date)) || (Number(b.priority || 0) - Number(a.priority || 0)));
const ongoing = live.filter(d => ord(d.end_date) == null)
  .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));

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
  if (cfg && cfg.id) {
    try {
      await access(`${W}/vendors/${cfg.id}.html`);
      return `${SITE}/vendors/${cfg.id}.html`;
    } catch { /* no page for this vendor yet */ }
  }
  return `${SITE}/#compare`;
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
const BRAND_LOCKUP = "/assets/brand/logo-full-lockup.png";
const LOCKUP_W = 240;
const SLOT_W = 64;
const SLOT_H = 44;
const LOGO_W = 52;
const LOGO_H = 32;
function logoUrl(meta) {
  if (!meta || !meta.logo) return null;
  return SITE + (meta.logo.startsWith("/") ? meta.logo : `/${meta.logo}`);
}

// Chip text colour picked from the background's brightness rather than fixed to
// white. Three vendors carry the sand brand colour, and white on sand is
// unreadable. Standard relative luminance, same threshold browsers use.
// A chip in one of the pale brand colours sits on a white card and all but
// vanishes. Three vendors carry the sand tone, so light chips get an edge in a
// darkened version of their own colour rather than a generic grey.
function darken(hex, amount) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return C.sand;
  const ch = [0, 2, 4].map(i => Math.round(parseInt(h.slice(i, i + 2), 16) * amount));
  return "#" + ch.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

function readableOn(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return C.paper;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.5 ? C.ink : C.paper;
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

// The figures line. This function is the whole reason the generator exists:
// there is no code path here that adds two percentages together, so a combined
// rate cannot reach a subscriber even when a vendor's own graphic advertises
// one. The separator is a middot, never an em-dash.
function figures(d) {
  const bits = [];
  if (d.sale_percent != null) bits.push(`<strong style="color:${C.forest};font-weight:700;">${d.sale_percent}% off</strong> automatically`);
  if (d.code_percent != null) bits.push(`<strong style="color:${C.forest};font-weight:700;">${esc(d.code || "SAMMYC")} ${d.code_percent}%</strong> off the reduced price`);
  bits.push(esc(window_(d)));
  return bits.join(' <span style="color:' + C.sand + ';">&middot;</span> ');
}

function window_(d) {
  const s = dayLabel(d.start_date), e = dayLabel(d.end_date);
  if (s && e) return `${s} to ${e}`;
  if (e) return `Through ${e}`;
  return "Ongoing";
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

async function card(d, last) {
  // Config display_name wins over the CMS field so a vendor renamed once in
  // vendor-config cannot be spelled a second way by a deal author.
  const meta = vendors[d.vendor] || {};
  const name = esc(meta.display_name || d.display_vendor || d.vendor);
  const brand = /^#[0-9a-fA-F]{6}$/.test(meta.brand_color || "") ? meta.brand_color : C.olive;
  const chipInk = readableOn(brand);
  const chipEdge = chipInk === C.ink ? `border:1px solid ${darken(brand, 0.82)};` : "";
  const logo = SHOW_LOGOS ? logoUrl(meta) : null;
  const shop = d.affiliate_url ? esc(d.affiliate_url) : null;
  const compare = esc(tagged(await compareUrl(d), sendDate));
  const flag = urgency(d);

  // The button label is fixed rather than read from cta_text. Authors write
  // things like "Shop Orbitrex Peptides" for the board, which is 180px wide
  // next to the compare link, enough to push the whole email past a phone's
  // width. The vendor name is two lines above it, so repeating it earns
  // nothing anyway.
  return `
              <tr>
                <td style="padding:20px 0 18px 0;${last ? "" : `border-bottom:1px solid ${C.stone};`}">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td valign="top">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            ${logo ? `<td width="${SLOT_W}" valign="middle" style="width:${SLOT_W}px;padding:0 12px 0 0;">
                              <table role="presentation" width="${SLOT_W}" cellpadding="0" cellspacing="0" border="0" style="width:${SLOT_W}px;">
                                <tr>
                                  <!-- align center on the slot only. The page wrapper cell is
                                       align="center" and that centering mode leaks into any block
                                       child with a fixed width, so alignment is stated explicitly
                                       at every level rather than left to inheritance. -->
                                  <td align="center" valign="middle" height="${SLOT_H}" bgcolor="${C.cream}" style="height:${SLOT_H}px;background:${C.cream};border:1px solid ${C.stone};border-radius:10px;text-align:center;">
                                    <!-- alt is empty on purpose. The company name is real text in
                                         the next cell now, so alt text here would print it twice
                                         whenever images are blocked. -->
                                    <img src="${esc(logo)}" alt="" style="display:inline-block;margin:0;width:auto;height:auto;max-width:${LOGO_W}px;max-height:${LOGO_H}px;border:0;outline:none;"/>
                                  </td>
                                </tr>
                              </table>
                            </td>` : ""}
                            <td valign="middle" align="left" style="text-align:left;font:800 16px/1.3 ${FONT};color:${C.ink};">${name}</td>
                            ${badge(d) ? `<td align="right" valign="middle" style="padding:1px 0 0 8px;">
                              <span style="display:inline-block;background:${brand};color:${chipInk};${chipEdge}font:800 10px/1 ${FONT};letter-spacing:.7px;text-transform:uppercase;padding:6px 9px;border-radius:999px;white-space:nowrap;">${esc(badge(d))}</span>
                            </td>` : ""}
                          </tr>
                        </table>
                        <div style="font:400 14px/1.5 ${FONT};color:${C.ink};padding:7px 0 0 0;">${esc(d.headline || "")}</div>
                        <div style="font:400 12px/1.6 ${FONT};color:${C.muted};padding:6px 0 0 0;">${figures(d)}</div>
                        ${flag ? `<div style="font:700 11px/1.4 ${FONT};color:${T.urgent};letter-spacing:.6px;text-transform:uppercase;padding:6px 0 0 0;">${esc(flag)}</div>` : ""}
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="padding:12px 0 0 0;">
                          <tr>
                            ${shop ? `<td style="padding:0 14px 0 0;">
                              <a href="${shop}" target="_blank" rel="nofollow sponsored noopener" style="display:inline-block;background:${C.forest};color:${C.cream};font:700 12px/1 ${FONT};text-decoration:none;padding:10px 16px;border-radius:999px;white-space:nowrap;">Shop now</a>
                            </td>` : ""}
                            <td>
                              <a href="${compare}" target="_blank" style="font:700 12px/1 ${FONT};color:${C.olive};text-decoration:none;border-bottom:1px solid ${C.sand};white-space:nowrap;">Compare $/mg &rsaquo;</a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;
}

function heading(text) {
  return `
              <tr>
                <td style="padding:24px 0 2px 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="20" style="width:20px;padding:0 8px 0 0;"><div style="height:2px;background:${C.sand};font-size:0;line-height:0;">&nbsp;</div></td>
                      <td style="font:800 11px/1 ${FONT};color:${C.olive};text-transform:uppercase;letter-spacing:1.6px;white-space:nowrap;">${esc(text)}</td>
                      <td style="padding:0 0 0 8px;"><div style="height:1px;background:${C.stone};font-size:0;line-height:0;">&nbsp;</div></td>
                    </tr>
                  </table>
                </td>
              </tr>`;
}

// The date most of the limited time deals close on. Nine of fourteen ending
// the same night is the single most useful fact in this send and it is not
// something anyone should be counting by hand each week. If no date carries a
// majority the copy drops the claim rather than rounding it into one.
const endTally = new Map();
for (const d of timed) {
  const e = ord(d.end_date);
  if (e != null) endTally.set(d.end_date, (endTally.get(d.end_date) || 0) + 1);
}
let closeDate = null, closeCount = 0;
for (const [iso, n] of endTally) if (n > closeCount) { closeDate = iso; closeCount = n; }
const majorityCloses = closeDate && closeCount * 2 > timed.length;
const closeDay = majorityCloses ? weekday(closeDate) : null;

// ---------------------------------------------------------------------------
// Seasonal themes.
//
// A theme only swaps the masthead, the intro copy and the accent colour. The
// deal rows, the figures logic and the compliance footer are untouched by it,
// so a themed send cannot accidentally become a differently regulated send.
//
// The Labor Day palette matches the site popup, navy with a red and blue
// bunting rule, so somebody who saw the popup and then opens the email
// recognises the same campaign rather than two unrelated ones.
// ---------------------------------------------------------------------------
const THEMES = {
  default: {
    eyebrow: "Price alerts",
    headerBg: C.forest,
    footerBg: C.forest2,
    accent: C.olive,
    urgent: C.danger,
    bunting: null,
    title: d => dayLabel(d),
    intro: "Every figure below is stated the way it is applied at checkout. The sale and the code stay separate numbers, never added together, because a combined rate does not survive the cart.",
    subject: line => `${line.charAt(0).toUpperCase()}${line.slice(1)}`,
    preheader: "Every tracked vendor, normalized to cost per mg, with the sale and the code stated separately."
  },
  "labor-day": {
    eyebrow: "Labor Day weekend",
    headerBg: "#1B2A4A",
    footerBg: "#16233D",
    accent: "#B23A34",
    urgent: "#B23A34",
    bunting: ["#B23A34", C.cream, "#2F4B7C"],
    // The headline carries the deadline and the line under it carries the
    // scale, so neither repeats the other or the subject line.
    title: () => closeDay ? `Most of these end ${closeDay}` : "Labor Day sales are live",
    intro: `${vendorCount} vendors are running Labor Day sales at the same time${closeDay ? `, and most of them close ${closeDay} night` : ""}. Every rate below is written the way it applies at checkout. The sitewide sale and the SAMMYC code stay separate numbers, because the combined figure vendors advertise is not what the cart charges you.`,
    subject: line => closeDay ? `Labor Day: ${live.length} sales live, most end ${closeDay}` : `Labor Day: ${line}`,
    preheader: closeDay ? `Labor Day sales are live. Most end ${closeDay}.` : "Labor Day sales are live."
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

const timedCards = (await Promise.all(timed.map((d, i) => card(d, i === timed.length - 1 && !ongoing.length)))).join("");
const ongoingCards = (await Promise.all(ongoing.map((d, i) => card(d, i === ongoing.length - 1)))).join("");

const countLine = live.length === 1
  ? "1 sale live right now"
  : `${live.length} sales live right now across ${vendorCount} vendor${vendorCount === 1 ? "" : "s"}`;

const subject = T.subject(countLine);
const preheader = T.preheader;

const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>MyPeptidePrice roundup</title>
</head>
<body style="margin:0;padding:0;background:${C.cream};">
<!-- Preview text. Sits in the inbox line after the subject. The spacer run
     after it stops the client from pulling body copy in behind it. -->
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.cream};opacity:0;">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <!-- width attribute for Outlook, which ignores max-width, and a percentage
           width in CSS for everything else so the table shrinks on a phone
           instead of forcing a horizontal scroll. -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

        <tr>
          <!-- The whole masthead is centred. align on the cell handles the text,
               and the lockup gets auto side margins because a block level image
               with a fixed width ignores text-align in most clients. -->
          <td align="center" style="background:${T.headerBg};border-radius:16px 16px 0 0;padding:28px 28px 26px 28px;text-align:center;">
            <div style="font:800 11px/1 ${FONT};color:${C.sand};text-transform:uppercase;letter-spacing:2px;text-align:center;">${esc(T.eyebrow)}</div>
            <!-- The wordmark is an image because email has no web fonts. Gmail
                 strips the font link the site uses, so any text version of the
                 brand name falls back to Arial and reads as a generic block
                 font. Type inside an image is type, no loading required.
                 Width only, so the lockup cannot be squashed the way the
                 square-sized symbol was. The alt text is styled to match what
                 it replaces, so a blocked image still reads as the brand. -->
            <div style="padding:14px 0 0 0;text-align:center;"><img src="${SITE}${BRAND_LOCKUP}" width="${LOCKUP_W}" alt="MyPeptidePrice.com" style="display:block;margin:0 auto;width:${LOCKUP_W}px;height:auto;max-width:${LOCKUP_W}px;border:0;outline:none;text-decoration:none;font:800 22px/1.2 ${FONT};color:${C.cream};letter-spacing:-.2px;text-align:center;"/></div>
            <div style="font:400 13px/1.5 ${FONT};color:${C.sand};padding:9px 0 0 0;text-align:center;">Live vendor pricing, normalized to cost per mg</div>
          </td>
        </tr>
        ${T.bunting ? `<tr>
          <!-- Three flat bands rather than a repeating graphic. An image here
               would be the one decorative element the layout could not do
               without, and it is the first thing a client blocks. -->
          <td style="padding:0;font-size:0;line-height:0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="height:5px;">
              <tr>
                ${T.bunting.map(c => `<td width="33%" bgcolor="${c}" style="height:5px;background:${c};font-size:0;line-height:0;">&nbsp;</td>`).join("")}
              </tr>
            </table>
          </td>
        </tr>` : ""}

        <tr>
          <td style="background:${C.paper};padding:30px 28px 0 28px;">
            ${T.bunting ? `<div style="font:800 11px/1 ${FONT};color:${T.accent};text-transform:uppercase;letter-spacing:1.6px;padding:0 0 10px 0;">${esc(dayLabel(sendDate))}</div>` : ""}
            <div style="font:800 26px/1.2 ${FONT};color:${C.ink};letter-spacing:-.4px;">${esc(T.title(sendDate))}</div>
            <div style="font:700 15px/1.4 ${FONT};color:${T.accent};padding:6px 0 0 0;">${esc(countLine)}</div>
            <div style="font:400 14px/1.65 ${FONT};color:${C.muted};padding:12px 0 0 0;">${esc(T.intro)}</div>
          </td>
        </tr>

        <tr>
          <td style="background:${C.paper};padding:0 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${timedCards ? heading("Limited time") + timedCards : ""}
              ${ongoingCards ? heading("Ongoing") + ongoingCards : ""}
            </table>
          </td>
        </tr>

        <tr>
          <td style="background:${C.paper};padding:26px 28px 32px 28px;" align="center">
            <a href="${esc(tagged(SITE + "/#compare", sendDate))}" target="_blank" style="display:inline-block;background:${T.accent};color:${C.cream};font:700 14px/1 ${FONT};text-decoration:none;padding:15px 30px;border-radius:999px;white-space:nowrap;">Compare every vendor</a>
            <div style="font:400 12px/1.6 ${FONT};color:${C.muted};padding:14px 0 0 0;">Prices update live from each vendor's own feed.</div>
          </td>
        </tr>

        <tr>
          <td style="background:${C.sand2};padding:20px 28px;">
            <div style="font:800 10px/1 ${FONT};color:${C.forest};text-transform:uppercase;letter-spacing:1.4px;">Research use only</div>
            <div style="font:400 12px/1.65 ${FONT};color:${C.ink};padding:9px 0 0 0;">All compounds referenced are sold by third party vendors for laboratory research use only. Not for human consumption. MyPeptidePrice.com does not sell products. Discounts, stock and final pricing are set by each vendor and change without notice, so confirm final pricing at checkout.</div>
          </td>
        </tr>

        <tr>
          <td style="background:${T.footerBg};border-radius:0 0 16px 16px;padding:22px 28px 26px 28px;">
            <div style="font:400 12px/1.65 ${FONT};color:${C.sand};">Outbound vendor links are affiliate links. If you buy through one, we may earn a commission at no additional cost to you.</div>
            <div style="font:400 12px/1.65 ${FONT};color:${C.sand};padding:11px 0 0 0;">You are receiving this because you confirmed a subscription to price alerts at MyPeptidePrice.com.</div>
            <div style="font:400 12px/1.65 ${FONT};color:${C.sand};padding:11px 0 0 0;"><a href="{{UnsubscribeURL}}" style="color:${C.cream};text-decoration:underline;">Unsubscribe</a></div>
            <div style="font:400 12px/1.65 ${FONT};color:${C.sand};padding:11px 0 0 0;">{{SenderInfo}}</div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
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
console.log(`  deals         ${live.length} across ${vendorCount} vendors (${timed.length} limited time, ${ongoing.length} ongoing)`);
if (suppressed) console.log(`  suppressed    ${suppressed} duplicate vendor entr${suppressed === 1 ? "y" : "ies"}`);
console.log(`  subject       ${subject}`);
console.log(`  preview text  ${preheader}`);
console.log(`\nPaste the file into the EmailOctopus campaign under Content, "Code your own".`);
