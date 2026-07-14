import { readFile, writeFile, mkdir } from "node:fs/promises";

const W = "/home/claude/work";
const VER = "20260714-v3-seo-permg-v1";
const TODAY = "July 2026";
const VALID_UNTIL = "2026-08-31";
const BASE = "https://mypeptideprice.com";

const snap = JSON.parse(await readFile(`${W}/data/catalog-fallback-snapshot.json`, "utf8"));
const vendorCfg = JSON.parse(await readFile(`${W}/data/vendor-config.json`, "utf8"));

const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jesc = s => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim();
const slug = s => String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const money = n => "$" + Number(n).toFixed(2);
const catUrl = c => `${BASE}/?cat=${encodeURIComponent(c)}`;

const NONPEP = ["Acetic Acid", "Bacteriostatic", "Travel Case", "Starter Kit", "Research Starter", "Case ONLY", "Protective Travel"];
const HAND_BUILT = new Map([
  ["semaglutide", "/semaglutide-price-comparison.html"],
  ["tirzepatide", "/tirzepatide-price-comparison.html"],
  ["retatrutide", "/retatrutide-price-comparison.html"],
  ["bpc-157", "/bpc-157-price-comparison.html"],
]);

const HEAD_ASSETS = `<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/assets/site.css?v=${VER}"/>`;

const GTM = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-PDQM5TBB');</script>
<!-- Meta Pixel -->
<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','2737586326608423');fbq('track','PageView');</script>`;

const NOSCRIPT = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-PDQM5TBB" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=2737586326608423&ev=PageView&noscript=1" alt=""/></noscript>`;

const PAGE_CSS = `<style>
.crumbs{max-width:1120px;margin:0 auto;padding:14px 20px 0;font-size:.82rem;color:var(--muted)}
.crumbs a{color:var(--olive-2);text-decoration:none}.crumbs a:hover{text-decoration:underline}.crumbs span{color:var(--muted);margin:0 6px}
.answer-box{max-width:1120px;margin:18px auto 0;padding:0 20px}
.answer-box .inner{background:var(--soft);border-left:4px solid var(--olive);border-radius:0 12px 12px 0;padding:14px 18px}
.answer-box .inner p{margin:0;font-size:1rem;line-height:1.6;color:var(--ink)}
.answer-box .inner strong{color:var(--forest)}
.snap-wrap{max-width:1120px;margin:0 auto;padding:8px 20px 0}
.snap-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:12px}
.snap-head h2{font-family:var(--font-display);color:var(--forest);margin:0;font-size:1.5rem}
.snap-meta{font-size:.8rem;color:var(--muted);display:inline-flex;align-items:center;gap:6px}
.snap-meta .dot{width:8px;height:8px;border-radius:50%;background:var(--olive);display:inline-block}
.price-card{background:var(--paper);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden}
.price-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;text-decoration:none;color:inherit;border-bottom:1px solid var(--line);transition:background .15s ease}
.price-row:last-child{border-bottom:0}
.price-row:hover{background:var(--soft)}
.price-size{min-width:0;display:block}
.price-size .size{display:block;font-weight:900;color:var(--ink);font-size:1.02rem}
.price-size .vendor{display:block;font-size:.83rem;color:var(--muted);margin-top:3px}
.price-size .disc{display:block;font-size:.77rem;color:var(--olive-2);font-weight:700;margin-top:3px}
.price-amount{text-align:right;white-space:nowrap}
.price-amount .from{display:block;font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.price-amount .amt{display:block;font-family:var(--font-body);font-weight:900;font-variant-numeric:tabular-nums;color:var(--forest);font-size:1.3rem;margin-top:2px}
.price-amount .permg{display:block;font-size:.72rem;color:var(--olive-2);font-weight:800;margin-top:2px}
.price-amount .go{display:block;font-size:.77rem;color:var(--olive-2);font-weight:700;margin-top:3px}
.snap-note{font-size:.78rem;color:var(--muted);margin-top:12px;line-height:1.5}
.snap-cta{margin-top:14px}
.copy{max-width:1120px;margin:0 auto;padding:0 20px}
.copy h2{font-family:var(--font-display);color:var(--forest);margin-bottom:6px}
.copy h3{font-family:var(--font-display);color:var(--forest);font-size:1.2rem;margin:22px 0 6px}
.copy p{color:var(--ink);line-height:1.7}
.research-tag{display:inline-block;background:var(--soft);color:var(--forest-2);border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:.75rem;font-weight:800;letter-spacing:.03em;margin-bottom:10px}
.xlink-wrap{max-width:1120px;margin:0 auto;padding:8px 20px}
.xlink-wrap h2{font-family:var(--font-display);color:var(--forest);font-size:1.2rem;margin:0 0 10px}
.xlink-grid{display:flex;flex-wrap:wrap;gap:8px}
.xlink-grid a{display:inline-block;background:var(--soft);border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:.82rem;font-weight:700;color:var(--forest);text-decoration:none}
.xlink-grid a:hover{background:var(--paper);border-color:var(--olive)}
.hub-grid{max-width:1120px;margin:0 auto;padding:8px 20px 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.hub-card{display:block;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px 16px;text-decoration:none;color:inherit;transition:border-color .15s,background .15s}
.hub-card:hover{border-color:var(--olive);background:var(--soft)}
.hub-card .hc-name{font-weight:900;color:var(--ink);font-size:1rem}
.hub-card .hc-cat{font-size:.76rem;color:var(--muted);margin-top:2px}
.hub-card .hc-price{font-size:.86rem;color:var(--forest);font-weight:800;margin-top:8px}
.hub-card .hc-price span{color:var(--muted);font-weight:600}
.hub-section-title{max-width:1120px;margin:22px auto 0;padding:0 20px;font-family:var(--font-display);color:var(--forest);font-size:1.15rem}
@media(max-width:520px){.snap-head h2{font-size:1.3rem}.answer-box .inner p{font-size:.95rem}
.price-row{flex-direction:column;align-items:flex-start;gap:10px}
.price-amount{text-align:left;width:100%}.price-amount .amt{font-size:1.4rem}}
</style>`;

function header() {
  return `<header class="site-top premium-top">
  <div class="top-inner">
    <a class="brand premium-brand" href="/" aria-label="MyPeptidePrice home">
      <span class="brand-mark-wrap" aria-hidden="true"><img class="brand-mark" src="/assets/brand/logo-symbol.png?v=${VER}" alt="" style="width:100%;height:100%;object-fit:contain;"/></span>
      <span class="brand-copy"><span class="brand-wordmark"><span class="brand-my">my</span><span class="brand-peptide">peptide</span><span class="brand-price">price</span><span class="brand-dot">.com</span></span><span class="brand-tagline">Research. Compare. Save.</span></span>
    </a>
    <button class="nav-toggle" type="button" data-nav-toggle aria-label="Open navigation"><span></span><span></span><span></span></button>
    <nav class="site-nav" data-site-nav>
      <a href="/#compare">Prices</a>
      <a href="/vendors.html">Vendors</a>
      <div class="nav-dd" data-nav-dd>
        <button class="nav-dd-toggle" type="button" data-nav-dd-toggle aria-expanded="false" aria-haspopup="true">Compounds<span class="nav-dd-caret" aria-hidden="true"></span></button>
        <div class="nav-dd-menu" data-nav-dd-menu>
          <a href="/semaglutide-price-comparison.html">Semaglutide</a>
          <a href="/tirzepatide-price-comparison.html">Tirzepatide</a>
          <a href="/retatrutide-price-comparison.html">Retatrutide</a>
          <a href="/bpc-157-price-comparison.html">BPC-157</a>
          <a href="/compounds.html">All compounds</a>
        </div>
      </div>
      <a href="/faq.html">FAQ</a>
      <a href="/blog/">Research</a>
      <a class="nav-code-pill" href="/#compare">Use SAMMYC</a>
    </nav>
  </div>
</header>
<div class="coupon-strip">Use <span class="code-pill">SAMMYC</span> at supported vendors for available discounts. Prices below reflect the known code where applicable.</div>`;
}

function footer() {
  return `<footer class="site-footer premium-footer">
  <div class="footer-inner">
    <div class="footer-col footer-col-brand">
      <div class="footer-brand premium-footer-brand">
        <span class="footer-mark-wrap" aria-hidden="true"><img class="footer-mark" src="/assets/brand/logo-symbol.png?v=${VER}" alt="" style="width:100%;height:100%;object-fit:contain;"/></span>
        <div><div class="footer-wordmark"><span class="footer-brand-my">my</span><span class="footer-brand-peptide">peptide</span><span class="footer-brand-price">price</span><span class="footer-brand-dot">.com</span></div><div class="footer-tagline">Research. Compare. Save.</div></div>
      </div>
      <div class="footer-note">Independent research peptide price comparison. Prices are estimates based on vendor listings and known discounts. Confirm final pricing, stock, testing documentation, and terms directly with each vendor. For laboratory research purposes only. Not medical advice.</div>
    </div>
    <div class="footer-col"><div class="footer-title">Compounds</div><div class="footer-links"><a href="/semaglutide-price-comparison.html">Semaglutide</a><a href="/tirzepatide-price-comparison.html">Tirzepatide</a><a href="/retatrutide-price-comparison.html">Retatrutide</a><a href="/bpc-157-price-comparison.html">BPC-157</a><a href="/compounds.html">All compounds</a></div></div>
    <div class="footer-col"><div class="footer-title">Site</div><div class="footer-links"><a href="/#compare">Compare prices</a><a href="/vendors.html">Vendors</a><a href="/faq.html">FAQ</a><a href="/blog/">Research</a></div></div>
    <div class="footer-col"><div class="footer-title">Legal</div><div class="footer-links"><a href="/disclaimer.html">Disclaimer</a><a href="/terms.html">Terms</a><a href="/privacy.html">Privacy</a></div></div>
  </div>
  <div class="footer-base"><span>&copy; 2026 MyPeptidePrice.com. Independent price comparison. For research use only.</span></div>
</footer>
<script src="/assets/site.js?v=${VER}"></script>`;
}

function shell({ title, desc, canonical, schema, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${canonical}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:type" content="website"/>
<meta property="og:image" content="${BASE}/og-image-2026-rebrand.png"/>
<link rel="icon" href="/favicon.png?v=${VER}"/>
<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png?v=${VER}"/>
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=${VER}"/>
<link rel="manifest" href="/site.webmanifest"/>
${HEAD_ASSETS}
${PAGE_CSS}
${GTM}
<script type="application/ld+json">
${schema}
</script>
</head>
<body>
${NOSCRIPT}
${header()}
${body}
${footer()}
</body>
</html>
`;
}

// ---- gather compound aggregates from the snapshot ----
function compoundData() {
  const out = [];
  for (const p of snap.products) {
    const name = p.name || p.title;
    if (!name || NONPEP.some(n => name.includes(n))) continue;
    const offers = [];
    for (const v of p.variants) for (const s of v.suppliers) {
      offers.push({
        vendor: s.vendor_display || s.vendor_name,
        vendorKey: s.vendor_name,
        size: s.quantity_label,
        price: s.effective_price_min,
        priceLabel: s.effective_price_label,
        regularLabel: s.regular_price_label,
        discount: s.discount_percent,
        code: s.coupon_code,
        url: s.affiliate_url,
        permg: s.price_per_mg_label,
        permgVal: s.price_per_mg,
        inStock: s.in_stock !== false,
      });
    }
    const vendors = new Set(offers.map(o => o.vendorKey));
    if (vendors.size < 2) continue;              // skip thin single-vendor pages
    // best offer = lowest effective price with a real number
    const priced = offers.filter(o => Number.isFinite(o.price) && o.price > 0);
    priced.sort((a, b) => a.price - b.price);
    const lo = priced.length ? priced[0].price : null;
    const hi = priced.length ? priced[priced.length - 1].price : null;
    out.push({ name, category: p.category || "Research peptide", offers, priced, vendors: [...vendors], lo, hi });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

const compounds = compoundData();
console.log("page-worthy compounds (2+ vendors):", compounds.length);

// dedupe by slug, skip hand-built
const compoundPages = compounds.filter(c => !HAND_BUILT.has(slug(c.name)));
console.log("to generate (excluding hand-built):", compoundPages.length);

await mkdir(`${W}/compounds`, { recursive: true }).catch(() => {});
await mkdir(`${W}/vendors`, { recursive: true }).catch(() => {});

const generated = { compounds: [], vendors: [] };

// ---- COMPOUND PAGES ----
for (const c of compoundPages) {
  const sg = slug(c.name);
  const path = `/compounds/${sg}.html`;
  const canonical = `${BASE}${path}`;
  const lowLabel = c.lo != null ? money(c.lo) : null;
  const title = `${c.name} Price Comparison | Compare $/mg Across Vendors`;
  const desc = `Compare ${c.name} research vial prices and cost per mg across ${c.vendors.length} tracked vendors${lowLabel ? `, from ${lowLabel} after the SAMMYC code` : ""}. Live pricing, updated continuously. Research use only.`;

  // price rows: dedupe identical (vendor,size,price)
  const seen = new Set();
  const rows = [];
  for (const o of c.priced.concat(c.offers.filter(o => !Number.isFinite(o.price)))) {
    const key = o.vendorKey + "|" + o.size + "|" + o.priceLabel;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(o);
    if (rows.length >= 14) break;
  }
  const rowsHtml = rows.map((o, i) => {
    const disc = o.discount > 0 && o.code ? `${o.discount}% off with ${esc(o.code)}` : (o.regularLabel && o.regularLabel !== o.priceLabel ? `Regular ${esc(o.regularLabel)}` : "Vendor offer tracked");
    return `<a class="price-row" href="${esc(o.url || "#")}" target="_blank" rel="nofollow sponsored noopener" data-affiliate="1" data-product="${esc(c.name)}" data-category="${esc(c.category)}" data-vendor="${esc(o.vendorKey)}" data-code="${esc(o.code || "")}"><span class="price-size"><span class="size">${esc(c.name)}${o.size && !/standard|choose/i.test(o.size) ? ", " + esc(o.size) : ""}</span><span class="vendor">${esc(o.vendor)}${/choose/i.test(o.size || "") ? ", size selected on vendor site" : ""}</span><span class="disc">${disc}</span></span><span class="price-amount"><span class="from">${i === 0 ? "Lowest" : "From"}</span><span class="amt">${esc(o.priceLabel || "Contact vendor")}</span>${o.permg ? `<span class="permg">${esc(o.permg)}</span>` : ""}<span class="go">Visit vendor &#8250;</span></span></a>`;
  }).join("\n");

  // related compounds in same category
  const related = compounds.filter(x => x.category === c.category && x.name !== c.name).slice(0, 8);
  const relatedHtml = related.length ? `<div class="xlink-wrap"><h2>Other ${esc(c.category)} compounds</h2><div class="xlink-grid">${related.map(r => `<a href="${HAND_BUILT.get(slug(r.name)) || "/compounds/" + slug(r.name) + ".html"}">${esc(r.name)}</a>`).join("")}</div></div>` : "";

  const bestVendor = c.priced.length ? (c.priced[0].vendor) : null;
  const answer = lowLabel
    ? `As of ${TODAY}, ${c.name} research vials are listed as low as ${lowLabel} after the SAMMYC code across ${c.vendors.length} tracked vendors${bestVendor ? `, currently lowest at ${esc(bestVendor)}` : ""}. For research use only, confirm pricing on the vendor website.`
    : `${c.name} is tracked across ${c.vendors.length} vendors. Compare current listings in the live comparison and confirm pricing on the vendor website. For research use only.`;

  const permgLine = (() => {
    const withMg = c.priced.filter(o => o.permgVal);
    if (!withMg.length) return "";
    withMg.sort((a, b) => a.permgVal - b.permgVal);
    return ` The lowest tracked cost per mg is ${esc(withMg[0].permg)}.`;
  })();

  const faq = [
    [`How much does ${c.name} cost?`, `${lowLabel ? `As of ${TODAY}, ${c.name} research vials are listed as low as ${lowLabel} after the SAMMYC code.` : `${c.name} pricing varies by size and vendor.`}${permgLine} Exact pricing depends on size, format, and vendor. Compare current listings in the live comparison and confirm the total on the vendor website before ordering.`],
    [`Which vendor has the cheapest ${c.name}?`, `The lowest estimated after-code price is ranked first in the live comparison on MyPeptidePrice.com${bestVendor ? `, currently ${bestVendor}` : ""}. Rankings change between refreshes because vendor pricing, stock, and discounts update over time.`],
    [`What does the SAMMYC code do for ${c.name} pricing?`, `When a tracked vendor supports the SAMMYC code, the comparison estimates the price after that known discount, commonly 10 to 15 percent. Confirm the code applies and review the final total on the vendor website.`],
    [`Is ${c.name} on this page for human use?`, `No. Every listing compared here is sold by third-party vendors for laboratory and research use only. MyPeptidePrice.com does not sell products and does not provide medical, dosing, or usage guidance.`],
    [`What is the 7/7 testing standard?`, `It refers to seven testing categories: Net Purity, Net Content, Heavy Metals, Endotoxins, Identification, Sterility, and Conformity. Review current certificates and product documentation directly with each vendor.`],
  ];

  const offerCount = c.priced.length || c.offers.length;
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
        { "@type": "ListItem", position: 2, name: "Compounds", item: `${BASE}/compounds.html` },
        { "@type": "ListItem", position: 3, name: c.name, item: canonical },
      ]},
      { "@type": "Product", name: `${c.name} Research Vial`, category: `${c.category} research peptide`,
        description: `${c.name} research vials compared across tracked vendors for laboratory and research use only. Not for human consumption.`,
        ...(c.lo != null ? { offers: { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: c.lo.toFixed(2), highPrice: (c.hi ?? c.lo).toFixed(2), priceValidUntil: VALID_UNTIL, availability: "https://schema.org/InStock", offerCount: String(offerCount) } } : {}) },
      { "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  }, null, 0).replace(/&/g, "&amp;");

  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/compounds.html">Compounds</a><span>/</span>${esc(c.name)}</nav>
<section class="hero"><div class="hero-inner"><div><span class="eyebrow">${esc(c.name)} price comparison</span><h1>${esc(c.name)} price comparison.</h1><p>Find the lowest listed ${esc(c.name)} research vial price across ${c.vendors.length} tracked vendors${lowLabel ? `, as low as ${lowLabel} after the SAMMYC code` : ""}.</p><div class="hero-actions"><a class="button" href="/?q=${encodeURIComponent(c.name)}#compare" data-cta="hero">Compare live prices</a></div></div><div class="hero-stats"><div class="hero-stat"><span>Lowest listed</span><strong>${lowLabel || "See vendors"}</strong></div><div class="hero-stat"><span>Tracked vendors</span><strong>${c.vendors.length}</strong></div><div class="hero-stat"><span>Discount code</span><strong>SAMMYC</strong></div></div></div></section>
<div class="answer-box"><div class="inner"><p><strong>${esc(answer)}</strong></p></div></div>
<section class="section compact"><div class="snap-wrap"><div class="snap-head"><h2>How much does ${esc(c.name)} cost?</h2><span class="snap-meta"><span class="dot"></span>Updated ${TODAY}</span></div>
<div class="price-card">
${rowsHtml}
</div>
<p class="snap-note">Estimates reflect the known SAMMYC discount where supported. Confirm final price, exact size, and stock status on the vendor website before ordering. For research use only.</p>
<div class="snap-cta"><a class="button" href="/?q=${encodeURIComponent(c.name)}#compare" data-cta="snapshot">See all ${esc(c.name)} vendors ranked by price</a></div>
</div></section>
<section class="section compact"><div class="copy"><span class="research-tag">Research context</span><h2>What is ${esc(c.name)}?</h2><p>${esc(c.name)} is a research compound listed in the MyPeptidePrice.com catalog under the ${esc(c.category)} category. Tracked vendors most often supply it as lyophilized research vials, with reconstitution and handling determined entirely by the purchasing laboratory.</p><p>Every listing referenced on this page is sold by independent third-party vendors for research use only and is not for human consumption. MyPeptidePrice.com is an independent price comparison resource. We do not sell products, ship orders, or provide medical, dosing, or usage guidance of any kind.</p></div></section>
${relatedHtml}
<section class="section"><div class="container"><span class="eyebrow" style="background:var(--forest);color:var(--sand)">${esc(c.name)} FAQ</span><h2>${esc(c.name)} pricing FAQ</h2><div class="faq-list">
${faq.map(([q, a]) => `<article class="faq-item"><h3>${esc(q)}</h3><p>${esc(a)}</p></article>`).join("\n")}
</div></div></section>
<section class="section compact"><div class="container"><div class="notice">Use <span class="code-pill">SAMMYC</span> at supported vendor checkouts where listed. Confirm the final price and product details directly on the vendor website. For research comparison purposes only. Prices last verified ${TODAY}.</div></div></section>`;

  await writeFile(`${W}${path}`, shell({ title, desc, canonical, schema, body }));
  generated.compounds.push({ path, name: c.name });
}
console.log("compound pages written:", generated.compounds.length);

// ---- VENDOR PAGES ----
// The config is an object keyed by vendor name. Only vendors that actually have
// priced offers in the snapshot get a page; the rest would be thin/empty shells
// (the fallback snapshot currently carries a subset of vendors, the rest arrive
// live from the Netlify function).
const vendorList = vendorCfg.vendors || vendorCfg;
const vendorNames = Array.isArray(vendorList)
  ? vendorList.map(v => ({ key: v.name || v.id, display: v.display_name || v.name || v.id }))
  : Object.entries(vendorList).map(([name, v]) => ({ key: name, display: v.display_name || name }));

for (const v of vendorNames) {
  const sg = slug(v.key);
  const path = `/vendors/${sg}.html`;
  const canonical = `${BASE}${path}`;
  // gather this vendor's offers across all compounds
  const items = [];
  for (const c of compounds) {
    for (const o of c.offers) {
      if (o.vendorKey === v.key && Number.isFinite(o.price)) items.push({ compound: c.name, category: c.category, ...o });
    }
  }
  const uniq = [];
  const seen = new Set();
  items.sort((a, b) => a.price - b.price);
  for (const it of items) {
    const k = it.compound + "|" + it.size + "|" + it.priceLabel;
    if (seen.has(k)) continue; seen.add(k); uniq.push(it);
  }
  const compoundCount = new Set(uniq.map(i => i.compound)).size;
  if (uniq.length === 0) { continue; } // vendor with no priced offers in snapshot, skip page
  const lo = uniq.length ? uniq[0].price : null;
  const title = `${v.display} Peptide Prices & Discount Code | MyPeptidePrice`;
  const desc = `Compare ${v.display} research peptide prices across ${compoundCount} compounds${lo != null ? `, from ${money(lo)} after the SAMMYC code` : ""}. Live tracked pricing and the current discount code. Research use only.`;

  const rowsHtml = uniq.slice(0, 20).map((o, i) => {
    const disc = o.discount > 0 && o.code ? `${o.discount}% off with ${esc(o.code)}` : "Vendor offer tracked";
    return `<a class="price-row" href="${esc(o.url || "#")}" target="_blank" rel="nofollow sponsored noopener" data-affiliate="1" data-product="${esc(o.compound)}" data-category="${esc(o.category)}" data-vendor="${esc(v.key)}" data-code="${esc(o.code || "")}"><span class="price-size"><span class="size">${esc(o.compound)}${o.size && !/standard|choose/i.test(o.size) ? ", " + esc(o.size) : ""}</span><span class="vendor">${esc(o.category)}</span><span class="disc">${disc}</span></span><span class="price-amount"><span class="from">${i === 0 ? "Lowest" : "Price"}</span><span class="amt">${esc(o.priceLabel)}</span>${o.permg ? `<span class="permg">${esc(o.permg)}</span>` : ""}<span class="go">Visit vendor &#8250;</span></span></a>`;
  }).join("\n");

  const faq = [
    [`Does ${v.display} have a discount code?`, `Where supported, the SAMMYC code is applied in the comparison to estimate after-code pricing for ${v.display}, commonly 10 to 15 percent off. Confirm the code applies at checkout on the vendor website.`],
    [`What research peptides does ${v.display} sell?`, `${v.display} is tracked across ${compoundCount} compounds in the MyPeptidePrice.com catalog. Browse the current listings above or compare against other vendors in the live comparison.`],
    [`Is ${v.display} products for human use?`, `No. ${v.display} listings tracked here are sold for laboratory and research use only. MyPeptidePrice.com is an independent price comparison resource and does not sell products or provide medical guidance.`],
  ];
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
        { "@type": "ListItem", position: 2, name: "Vendors", item: `${BASE}/vendors.html` },
        { "@type": "ListItem", position: 3, name: v.display, item: canonical },
      ]},
      { "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  }, null, 0).replace(/&/g, "&amp;");

  const topCompounds = [...new Set(uniq.map(i => i.compound))].slice(0, 10);
  const xlinks = topCompounds.map(name => `<a href="${HAND_BUILT.get(slug(name)) || "/compounds/" + slug(name) + ".html"}">${esc(name)}</a>`).join("");

  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/vendors.html">Vendors</a><span>/</span>${esc(v.display)}</nav>
<section class="hero"><div class="hero-inner"><div><span class="eyebrow">${esc(v.display)} price tracking</span><h1>${esc(v.display)} peptide prices.</h1><p>Compare ${esc(v.display)} research peptide listings across ${compoundCount} tracked compounds${lo != null ? `, from ${money(lo)} after the SAMMYC code` : ""}.</p><div class="hero-actions"><a class="button" href="/?vendor=${encodeURIComponent(v.key)}#compare" data-cta="hero">See ${esc(v.display)} in the live comparison</a></div></div><div class="hero-stats"><div class="hero-stat"><span>Lowest tracked</span><strong>${lo != null ? money(lo) : "See list"}</strong></div><div class="hero-stat"><span>Compounds</span><strong>${compoundCount}</strong></div><div class="hero-stat"><span>Discount code</span><strong>SAMMYC</strong></div></div></div></section>
<div class="answer-box"><div class="inner"><p><strong>${esc(v.display)} is tracked across ${compoundCount} research compounds on MyPeptidePrice.com${lo != null ? `, with listings from ${money(lo)} after the SAMMYC code` : ""}.</strong> Prices below reflect the known code where supported. For research use only, confirm pricing on the vendor website.</p></div></div>
<section class="section compact"><div class="snap-wrap"><div class="snap-head"><h2>${esc(v.display)} tracked listings</h2><span class="snap-meta"><span class="dot"></span>Updated ${TODAY}</span></div>
<div class="price-card">
${rowsHtml}
</div>
<p class="snap-note">Estimates reflect the known SAMMYC discount where supported. Confirm final price, exact size, and stock status on the vendor website before ordering. For research use only.</p>
<div class="snap-cta"><a class="button" href="/?vendor=${encodeURIComponent(v.key)}#compare" data-cta="snapshot">Compare ${esc(v.display)} against other vendors</a></div>
</div></section>
<div class="xlink-wrap"><h2>Popular compounds at ${esc(v.display)}</h2><div class="xlink-grid">${xlinks}</div></div>
<section class="section"><div class="container"><span class="eyebrow" style="background:var(--forest);color:var(--sand)">${esc(v.display)} FAQ</span><h2>${esc(v.display)} pricing FAQ</h2><div class="faq-list">
${faq.map(([q, a]) => `<article class="faq-item"><h3>${esc(q)}</h3><p>${esc(a)}</p></article>`).join("\n")}
</div></div></section>
<section class="section compact"><div class="container"><div class="notice">Use <span class="code-pill">SAMMYC</span> at supported vendor checkouts where listed. MyPeptidePrice.com is an independent comparison resource, not a seller. Confirm final details on the vendor website. Prices last verified ${TODAY}.</div></div></section>`;

  await writeFile(`${W}${path}`, shell({ title, desc, canonical, schema, body }));
  generated.vendors.push({ path, name: v.display });
}
console.log("vendor pages written:", generated.vendors.length);

// ---- COMPOUNDS HUB ----
{
  const canonical = `${BASE}/compounds.html`;
  const title = "All Peptide Compounds | Price Comparison by $/mg";
  const desc = `Browse every research peptide tracked on MyPeptidePrice.com. Compare prices and cost per mg across ${compounds.length} compounds and 13 vendors. Research use only.`;
  const byCat = {};
  for (const c of compounds) (byCat[c.category] = byCat[c.category] || []).push(c);
  const cats = Object.keys(byCat).sort();
  const sections = cats.map(cat => {
    const cards = byCat[cat].map(c => {
      const href = HAND_BUILT.get(slug(c.name)) || `/compounds/${slug(c.name)}.html`;
      return `<a class="hub-card" href="${href}"><div class="hc-name">${esc(c.name)}</div><div class="hc-cat">${c.vendors.length} vendors</div>${c.lo != null ? `<div class="hc-price">${money(c.lo)} <span>lowest after code</span></div>` : ""}</a>`;
    }).join("\n");
    return `<div class="hub-section-title">${esc(cat)}</div><div class="hub-grid">${cards}</div>`;
  }).join("\n");

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
        { "@type": "ListItem", position: 2, name: "Compounds", item: canonical },
      ]},
      { "@type": "CollectionPage", name: "All Peptide Compounds", description: desc,
        url: canonical },
    ],
  }, null, 0).replace(/&/g, "&amp;");

  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span>Compounds</nav>
<section class="hero"><div class="hero-inner"><div><span class="eyebrow">Compound directory</span><h1>All tracked peptide compounds.</h1><p>Browse every research compound compared on MyPeptidePrice.com, grouped by category. Each page ranks vendors by price and cost per mg.</p><div class="hero-actions"><a class="button" href="/#compare" data-cta="hero">Open the live comparison</a></div></div><div class="hero-stats"><div class="hero-stat"><span>Compounds</span><strong>${compounds.length}</strong></div><div class="hero-stat"><span>Vendors</span><strong>13</strong></div><div class="hero-stat"><span>Discount code</span><strong>SAMMYC</strong></div></div></div></section>
${sections}
<section class="section compact" style="margin-top:22px"><div class="container"><div class="notice">Use <span class="code-pill">SAMMYC</span> at supported vendor checkouts where listed. MyPeptidePrice.com is an independent comparison resource. For research use only. Prices last verified ${TODAY}.</div></div></section>`;

  await writeFile(`${W}/compounds.html`, shell({ title, desc, canonical, schema, body }));
  console.log("compounds hub written");
}

// ---- emit sitemap additions ----
const extra = [];
for (const g of generated.compounds) extra.push([g.path, "0.7"]);
for (const g of generated.vendors) extra.push([g.path, "0.6"]);
extra.push(["/compounds.html", "0.8"]);
await writeFile(`${W}/scripts/_generated-urls.json`, JSON.stringify(extra, null, 0));
console.log("total generated pages:", generated.compounds.length + generated.vendors.length + 1);
