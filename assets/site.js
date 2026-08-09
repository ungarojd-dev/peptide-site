(function(){
  "use strict";

  const COMPLIANCE_KEY="mpp_compliance_session_acceptance_v3";
  const COMPLIANCE_VERSION="2026-06-04-v3";
  const EXEMPT_PATHS=new Set(["/terms.html","/privacy.html","/disclaimer.html","/404.html"]);

  // Search crawlers do not persist sessionStorage and never click Accept, so
  // without this they render every page with the disclaimer overlay covering
  // the catalog. That makes Google evaluate the visible page as a gate instead
  // of a comparison tool, which suppresses rankings even though the catalog is
  // in the DOM underneath. We skip only the visual overlay for crawlers. The
  // content they index is identical to what a human sees after accepting, so
  // this is not cloaking.
  function isCrawler(){
    try{
      const ua=(navigator.userAgent||"").toLowerCase();
      if(!ua) return false;
      return /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|sogou|exabot|facebot|facebookexternalhit|ia_archiver|applebot|petalbot|bytespider|gptbot|google-inspectiontool|chrome-lighthouse|storebot-google|adsbot-google|mediapartners-google/.test(ua);
    }catch(error){
      return false;
    }
  }

  const toggle=document.querySelector("[data-nav-toggle]");
  const nav=document.querySelector("[data-site-nav]");
  if(toggle&&nav) toggle.addEventListener("click",()=>nav.classList.toggle("show"));
  const navDd=document.querySelector("[data-nav-dd]");
  if(navDd){
    const ddToggle=navDd.querySelector("[data-nav-dd-toggle]");
    const closeDd=()=>{navDd.classList.remove("open");ddToggle.setAttribute("aria-expanded","false");};
    ddToggle.addEventListener("click",event=>{
      event.stopPropagation();
      const open=!navDd.classList.contains("open");
      navDd.classList.toggle("open",open);
      ddToggle.setAttribute("aria-expanded",open?"true":"false");
    });
    document.addEventListener("click",event=>{ if(!navDd.contains(event.target)) closeDd(); });
    document.addEventListener("keydown",event=>{ if(event.key==="Escape") closeDd(); });
  }
  document.querySelectorAll("[data-year]").forEach(node=>node.textContent=String(new Date().getFullYear()));

  const escapeHtml=value=>String(value).replace(/[&<>\"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#039;"}[char]));

  function clearLegacyAcceptance(){
    try{
      ["mpp_compliance_gate_acceptance_v2","mpp_research_disclaimer_accepted"].forEach(key=>localStorage.removeItem(key));
    }catch(error){
      // Local storage cleanup is best effort only.
    }
  }

  function hasAcceptedCompliance(){
    try{
      const raw=sessionStorage.getItem(COMPLIANCE_KEY);
      if(!raw) return false;
      const parsed=JSON.parse(raw);
      return parsed&&parsed.version===COMPLIANCE_VERSION&&parsed.accepted===true;
    }catch(error){
      return false;
    }
  }

  function saveAcceptance(){
    try{
      sessionStorage.setItem(COMPLIANCE_KEY,JSON.stringify({accepted:true,version:COMPLIANCE_VERSION,accepted_at:new Date().toISOString()}));
    }catch(error){
      // If storage is unavailable, allow access for the current page load only.
    }
    clearLegacyAcceptance();
  }

  function complianceMarkup(){
    return `
      <div class="mpp-compliance-backdrop" data-compliance-backdrop>
        <section class="mpp-compliance-card" role="dialog" aria-modal="true" aria-labelledby="mpp-compliance-title">
          <header class="mpp-compliance-header">
            <div class="mpp-compliance-icon" aria-hidden="true"><img src="/assets/brand/logo-symbol.png" alt="" width="32" height="32"/></div>
            <div>
              <h2 id="mpp-compliance-title">Research Use and Compliance Disclaimer</h2>
              <p>Please review and acknowledge before accessing the website.</p>
            </div>
          </header>
          <div class="mpp-compliance-content">
            <p>Before accessing or using MyPeptidePrice.com, all visitors must review, acknowledge, and agree to the following terms:</p>
            <ol class="mpp-compliance-summary">
              <li>Listings referenced or linked from this website are presented for lawful laboratory research comparison purposes only. They are not intended for human or animal consumption.</li>
              <li>Information on this website is not medical advice, scientific advice, clinical guidance, or a recommendation to purchase or use any product.</li>
              <li>MyPeptidePrice.com is an independent comparison and affiliate website. We do not manufacture, sell, dispense, fulfill, or ship products.</li>
              <li>Prices, stock status, testing documents, and vendor information can change. Confirm details directly with the applicable third-party vendor.</li>
              <li>By accessing this website, you accept responsibility for complying with the laws and regulations that apply in your jurisdiction.</li>
            </ol>
            <p class="mpp-compliance-confirm">By continuing to access the website, you confirm that you:</p>
            <div class="mpp-compliance-checks" data-compliance-checks>
              <label><input type="checkbox" data-compliance-check/> <span>I have read and understood the Research Use and Compliance Disclaimer above.</span></label>
              <label><input type="checkbox" data-compliance-check/> <span>I am at least 21 years of age.</span></label>
              <label><input type="checkbox" data-compliance-check/> <span>I am a qualified researcher, or an authorized representative, accessing this website solely for lawful research comparison purposes.</span></label>
              <label><input type="checkbox" data-compliance-check/> <span>I agree that my access to this website constitutes acceptance of the <a href="/terms.html" target="_blank" rel="noopener">Terms of Use</a> and acknowledgment of the affiliate disclosure.</span></label>
            </div>
            <p class="mpp-compliance-helper">If you do not agree to these terms, you must exit the website. Access is not permitted without acceptance.</p>
            <button class="mpp-compliance-link" type="button" data-compliance-full-open><span aria-hidden="true">▣</span> View full disclaimers</button>
          </div>
          <div class="mpp-compliance-scroll-hint" data-compliance-scroll-hint><svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2v10M4 8l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg> Scroll for required checkboxes</div>
          <footer class="mpp-compliance-footer">
            <button class="mpp-compliance-secondary" type="button" data-compliance-accept-all><span aria-hidden="true">✓</span> Accept all</button>
            <button class="mpp-compliance-decline" type="button" data-compliance-decline>Decline &amp; exit</button>
            <button class="mpp-compliance-primary" type="button" data-compliance-submit disabled><span aria-hidden="true">▣</span> Submit &amp; enter</button>
          </footer>
        </section>
        <section class="mpp-full-disclaimer" role="dialog" aria-modal="true" aria-labelledby="mpp-full-disclaimer-title" hidden>
          <header class="mpp-full-disclaimer-header">
            <div>
              <h2 id="mpp-full-disclaimer-title">Full Disclaimers</h2>
              <p>Read-only reference. Closing this returns you to the acceptance screen.</p>
            </div>
            <button type="button" data-compliance-full-close aria-label="Return to acceptance screen">×</button>
          </header>
          <div class="mpp-full-disclaimer-scroll">
            <h3>General information only, no medical or scientific advice</h3>
            <p>MyPeptidePrice.com provides informational and comparative content only. Nothing on this website should be interpreted as medical advice, scientific advice, clinical guidance, a diagnosis, or a recommendation to purchase, use, administer, or consume any product. Products referenced on this website are intended for lawful laboratory research comparison only.</p>
            <h3>Research-use-only notice</h3>
            <p>Listings referenced or linked on this website are presented for lawful research comparison. They are not intended for human or animal consumption, diagnostic use, treatment, prevention, food use, drug use, cosmetic use, or household use.</p>
            <ul>
              <li>Descriptions and vendor claims have not been independently verified by MyPeptidePrice.com.</li>
              <li>Nothing displayed on this website should be construed as medical advice.</li>
              <li>Users are responsible for complying with applicable laws and regulations.</li>
            </ul>
            <h3>No sale of products</h3>
            <p>MyPeptidePrice.com is a price-comparison and affiliate website. We do not manufacture, sell, dispense, distribute, fulfill, ship, or accept payment for products. Any transaction occurs on an independent third-party vendor website. Contact the applicable vendor for questions about orders, refunds, returns, shipping, testing documents, or customer service.</p>
            <h3>Affiliate disclosure</h3>
            <p>Some outbound links, referral parameters, and discount codes are affiliate links. MyPeptidePrice.com may receive compensation when visitors use those links or codes. Compensation does not guarantee a favorable listing position, endorsement, or recommendation.</p>
            <h3>Third-party responsibility</h3>
            <p>Product names, descriptions, availability, pricing, stock status, testing documents, and other representations are provided by independent vendors. Confirm all details directly with the applicable vendor before completing any transaction.</p>
            <h3>No endorsement</h3>
            <p>Displaying or tracking a vendor or listing does not constitute certification, regulatory approval, medical approval, or a guarantee of quality, legality, availability, testing status, or suitability.</p>
            <h3>Accuracy of information</h3>
            <p>We make reasonable efforts to keep comparison information current, but vendor-side changes, delayed feed updates, errors, omissions, and outages can occur. Confirm the final price, discount, stock status, testing documentation, and vendor terms directly on the third-party website.</p>
            <h3>User responsibility and legal compliance</h3>
            <p>You are solely responsible for ensuring that your use of this website and any third-party vendor website complies with the laws, regulations, and restrictions that apply in your jurisdiction. Do not use this website for any unlawful purpose.</p>
            <h3>Limitation of liability and warranties</h3>
            <p>Use of this website is at your own risk. Information and services are provided on an as-is and as-available basis, without warranties regarding accuracy, completeness, uninterrupted access, or fitness for a particular purpose.</p>
            <h3>No warranties</h3>
            <p>To the fullest extent permitted by law, all content and services are provided without express or implied warranties. Review the complete Terms of Use for additional provisions.</p>
            <p class="mpp-full-disclaimer-links"><a href="/terms.html" target="_blank" rel="noopener">Terms of Use</a><a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a><a href="/disclaimer.html" target="_blank" rel="noopener">Open standalone disclaimer</a></p>
          </div>
          <footer class="mpp-full-disclaimer-footer"><button type="button" data-compliance-full-close><span aria-hidden="true">←</span> Return to acceptance screen</button></footer>
        </section>
      </div>`;
  }

  function initComplianceGate(){
    if(EXEMPT_PATHS.has(window.location.pathname)||window.location.pathname.startsWith("/admin/")) return;
    clearLegacyAcceptance();
    if(hasAcceptedCompliance()||isCrawler()){
      document.dispatchEvent(new CustomEvent("mpp:compliance-accepted"));
      return;
    }
    const root=document.createElement("div");
    root.className="mpp-compliance-root";
    root.innerHTML=complianceMarkup();
    document.body.appendChild(root);
    document.body.classList.add("mpp-compliance-open");

    const card=root.querySelector(".mpp-compliance-card");
    const full=root.querySelector(".mpp-full-disclaimer");
    const checks=[...root.querySelectorAll("[data-compliance-check]")];
    const submit=root.querySelector("[data-compliance-submit]");
    const content=root.querySelector(".mpp-compliance-content");
    const scrollHint=root.querySelector("[data-compliance-scroll-hint]");
    const updateScrollHint=()=>{
      if(!content||!scrollHint) return;
      const hasOverflow=content.scrollHeight>content.clientHeight+4;
      const nearBottom=content.scrollTop+content.clientHeight>=content.scrollHeight-12;
      scrollHint.classList.toggle("show",hasOverflow&&!nearBottom);
    };
    if(content){
      content.addEventListener("scroll",updateScrollHint,{passive:true});
      window.addEventListener("resize",updateScrollHint);
      setTimeout(updateScrollHint,50);
    }
    const update=()=>{submit.disabled=!checks.every(input=>input.checked)};
    checks.forEach(input=>input.addEventListener("change",update));
    root.querySelector("[data-compliance-accept-all]").addEventListener("click",()=>{checks.forEach(input=>input.checked=true);update();submit.focus()});
    root.querySelector("[data-compliance-decline]").addEventListener("click",()=>window.location.replace("about:blank"));
    submit.addEventListener("click",()=>{
      if(submit.disabled) return;
      saveAcceptance();
      document.body.classList.remove("mpp-compliance-open");
      root.remove();
      window.dataLayer=window.dataLayer||[];
      window.dataLayer.push({event:"compliance_gate_accepted",gate_version:COMPLIANCE_VERSION,acceptance_scope:"browser_session"});
      document.dispatchEvent(new CustomEvent("mpp:compliance-accepted"));
    });
    const openFull=()=>{card.hidden=true;full.hidden=false;full.querySelector("[data-compliance-full-close]")?.focus()};
    const closeFull=()=>{full.hidden=true;card.hidden=false;root.querySelector("[data-compliance-full-open]")?.focus()};
    root.querySelector("[data-compliance-full-open]").addEventListener("click",openFull);
    root.querySelectorAll("[data-compliance-full-close]").forEach(button=>button.addEventListener("click",closeFull));
    update();
  }

  const PROMOTIONS_URL="/data/promotions.json?v=20260809-deal-corrections-v47";
  const promoState={all:[],active:[],loaded:false};
  const promotionTime=value=>value?new Date(value).getTime():null;
  const isPromotionActive=(promotion,when=Date.now())=>{
    const starts=promotionTime(promotion.start_at);
    const ends=promotionTime(promotion.end_at);
    return (starts==null||when>=starts)&&(ends==null||when<=ends);
  };
  const promotionAppliesToOffer=(promotion,supplier={},card={})=>{
    if(promotion.vendor!==supplier.vendor_name) return false;
    const categories=[...(promotion.applicable_categories||[]),...(promotion.scope_categories||[])];
    const terms=promotion.match_terms||[];
    if(!categories.length&&!terms.length) return true;
    const haystack=[card.name,card.category,card.format,supplier.raw_product,supplier.raw_listing,supplier.sku].filter(Boolean).join(" ").toLowerCase();
    return categories.includes(card.category)||terms.some(term=>haystack.includes(String(term).toLowerCase()));
  };
  const activePromotions=()=>promoState.active;
  const offerPromotions=(supplier,card)=>activePromotions().filter(promotion=>promotion.show_vendor_badge&&promotionAppliesToOffer(promotion,supplier,card));
  // Every active promo for an offer, including sales that use a generic
  // disclosure pill instead of changing the calculated catalog price.
  const offerPromotionsAll=(supplier,card)=>activePromotions().filter(promotion=>promotionAppliesToOffer(promotion,supplier,card));
  const promotionDateText=promotion=>{
    if(!promotion.start_at&&!promotion.end_at) return "Active promotion";
    const options={month:"short",day:"numeric"};
    const start=promotion.start_at?new Date(promotion.start_at).toLocaleDateString("en-US",options):"Now";
    const end=promotion.end_at?new Date(promotion.end_at).toLocaleDateString("en-US",options):"Ongoing";
    return `${start} to ${end}`;
  };
  const promotionPanelMarkup=promotions=>`<div class="promo-panel-backdrop" data-promo-panel-backdrop hidden><section class="promo-panel" role="dialog" aria-modal="true" aria-labelledby="promo-panel-title"><header class="promo-panel-header"><div><span class="promo-panel-eyebrow">Current vendor promotions</span><h2 id="promo-panel-title">View all active deals</h2><p>Confirm final eligibility, stacking rules, and checkout pricing directly with each vendor.</p></div><button class="promo-panel-close" type="button" data-promo-panel-close aria-label="Close active deals">×</button></header><div class="promo-panel-scroll">${promotions.map(promotion=>`<article class="promo-detail-card"><div class="promo-detail-top"><div><h3>${escapeHtml(promotion.display_vendor||promotion.vendor)}</h3><strong>${escapeHtml(promotion.headline)}</strong></div><span>${escapeHtml(promotionDateText(promotion))}</span></div><p>${escapeHtml(promotion.full_detail)}</p><a href="${escapeHtml(promotion.affiliate_url||"#")}" target="_blank" rel="nofollow sponsored noopener" data-promo-affiliate="1" data-promo-vendor="${escapeHtml(promotion.vendor)}">Visit vendor ›</a></article>`).join("")}</div><footer class="promo-panel-footer"><p>Promotions can change or end without notice. Third-party vendor terms control.</p><button type="button" data-promo-panel-close>Return to comparisons</button></footer></section></div>`;
  let promoPanelRoot=null;
  const openPromotionPanel=()=>{
    if(!promoPanelRoot) return;
    promoPanelRoot.hidden=false;
    document.body.classList.add("promo-panel-open");
    promoPanelRoot.querySelector("[data-promo-panel-close]")?.focus();
  };
  const closePromotionPanel=()=>{
    if(!promoPanelRoot) return;
    promoPanelRoot.hidden=true;
    document.body.classList.remove("promo-panel-open");
  };
  function setupPromotionPanel(promotions){
    if(promoPanelRoot) promoPanelRoot.remove();
    const holder=document.createElement("div");
    holder.innerHTML=promotionPanelMarkup(promotions);
    promoPanelRoot=holder.firstElementChild;
    document.body.appendChild(promoPanelRoot);
    promoPanelRoot.querySelectorAll("[data-promo-panel-close]").forEach(button=>button.addEventListener("click",closePromotionPanel));
    promoPanelRoot.addEventListener("click",event=>{if(event.target===promoPanelRoot)closePromotionPanel()});
    promoPanelRoot.querySelectorAll("[data-promo-affiliate='1']").forEach(link=>link.addEventListener("click",()=>{window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:"affiliate_click",product_name:"Active deals panel",product_category:"promotion",button_text:"Visit vendor",button_location:"active_deals_panel",affiliate_network:"direct_vendor",vendor_name:link.dataset.promoVendor||"",affiliate_url:link.href})}));
  }
  const splitHeadlineBadge=headline=>({badge:null,text:headline});

  // ── Today's Deals roundup ──────────────────────────────────────────────
  // A single concise panel of everything happening now, opened from the
  // header button. Generated entirely from promotions.json so it can never go
  // stale: buckets are computed from each promo's own start/end dates.
  function dealBuckets(all){
    const now=Date.now();
    const HOUR=3.6e6;
    const b={ending:[],live:[],upcoming:[],standing:[]};
    for(const p of all){
      const offer=p.strip_offer||p.announce_offer||p.headline||p.short_detail||"";
      if(!offer && p.discount_override_percent==null && !p.show_in_strip) continue;
      const start=p.start_at?new Date(p.start_at).getTime():null;
      const end=p.end_at?new Date(p.end_at).getTime():null;
      const active=(!start||start<=now)&&(!end||end>=now);
      const item={
        vendor:p.display_vendor||p.vendor||"",
        offer,
        sale:Number.isFinite(Number(p.sale_percent))?Number(p.sale_percent):null,
        code:Number.isFinite(Number(p.code_percent))?Number(p.code_percent):null,
        stack:p.strip_stack||"SAMMYC",
        url:p.affiliate_url||"#",
        vendorKey:p.vendor||"",
        endLabel:end?new Date(end).toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"America/New_York"}):"",
        startLabel:start?new Date(start).toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"America/New_York"}):""
      };
      if(start&&start>now){ b.upcoming.push(item); }
      else if(active&&end){ ((end-now)<=48*HOUR ? b.ending : b.live).push(item); }
      else if(active&&!end){
        // Announcements = pure news with no special offer to act on: new
        // partners (their % is just standard SAMMYC) and community items.
        // Everything with a real offer, including special first-order codes,
        // belongs in the live deal buckets.
        const isAnnouncement=p.show_in_announcement===true&&p.show_in_deals!==true;
        (isAnnouncement?b.standing:b.live).push(item);
      }
    }
    return b;
  }
  function dealLineHtml(it){
    // Show both parts when a sitewide sale stacks with a code, else the single rate.
    let rate="";
    if(it.sale!=null&&it.code!=null){ rate=`<span class="deal-rate">${it.sale}% off <span class="deal-rate-plus">+ ${it.code}% with ${escapeHtml(it.stack)}</span></span>`; }
    else if(it.code!=null){ rate=`<span class="deal-rate">${it.code}% with ${escapeHtml(it.stack)}</span>`; }
    const when = it.endLabel?`<span class="deal-when">ends ${escapeHtml(it.endLabel)}</span>` : (it.startLabel?`<span class="deal-when">starts ${escapeHtml(it.startLabel)}</span>`:"");
    return `<a class="deal-line" href="${escapeHtml(it.url)}" target="_blank" rel="nofollow sponsored noopener" data-deal-affiliate="1" data-deal-vendor="${escapeHtml(it.vendorKey)}"><span class="deal-line-main"><strong>${escapeHtml(it.vendor)}</strong> <span class="deal-offer">${escapeHtml(it.offer)}</span></span>${rate||""}${when}</a>`;
  }
  const dealsPanelMarkup=all=>{
    const b=dealBuckets(all);
    const section=(title,cls,items)=> items.length?`<div class="deals-group ${cls}"><h3>${title} <span class="deals-group-n">${items.length}</span></h3>${items.map(dealLineHtml).join("")}</div>`:"";
    const total=b.ending.length+b.live.length+b.upcoming.length;
    return `<div class="deals-panel-backdrop" data-deals-backdrop hidden><section class="deals-panel" role="dialog" aria-modal="true" aria-labelledby="deals-panel-title"><header class="deals-panel-header"><div><span class="deals-eyebrow">Live roundup</span><h2 id="deals-panel-title">Today's Deals</h2></div><button class="deals-close" type="button" data-deals-close aria-label="Close deals">×</button></header><div class="deals-panel-scroll">${section("Ending soon","is-ending",b.ending)}${section("Live now","is-live",b.live)}${section("Upcoming","is-upcoming",b.upcoming)}${total===0?'<p class="deals-empty">No active deals right now. Check back soon.</p>':""}</div><footer class="deals-panel-footer">Prices and stacking are set by each vendor and can change. Confirm at checkout.</footer></section></div>`;
  };
  let dealsPanelRoot=null;
  const openDealsPanel=()=>{ if(dealsPanelRoot){ dealsPanelRoot.hidden=false; document.body.classList.add("deals-panel-open"); dealsPanelRoot.querySelector("[data-deals-close]")?.focus(); } };
  const closeDealsPanel=()=>{ if(dealsPanelRoot){ dealsPanelRoot.hidden=true; document.body.classList.remove("deals-panel-open"); } };
  // Today's Deals is a deal surface. An entry that only ticks "Announcement
  // strip (top bar)" is vendor news, not an offer, and was appearing here and
  // in the header count because the panel received every promotion. Anything
  // shown in the deal carousel or the roundup still appears; only strip-only
  // announcements are filtered out.
  function isDealSurface(promo){
    return promo.show_in_deals===true;
  }
  function setupDealsPanel(everything){
    const all=(everything||[]).filter(isDealSurface);
    if(dealsPanelRoot) dealsPanelRoot.remove();
    const holder=document.createElement("div");
    holder.innerHTML=dealsPanelMarkup(all);
    dealsPanelRoot=holder.firstElementChild;
    document.body.appendChild(dealsPanelRoot);
    dealsPanelRoot.querySelectorAll("[data-deals-close]").forEach(btn=>btn.addEventListener("click",closeDealsPanel));
    dealsPanelRoot.addEventListener("click",e=>{if(e.target===dealsPanelRoot)closeDealsPanel();});
    dealsPanelRoot.querySelectorAll("[data-deal-affiliate='1']").forEach(link=>link.addEventListener("click",()=>{window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:"affiliate_click",product_name:"Today's Deals roundup",product_category:"promotion",button_text:"Deal line",button_location:"deals_roundup_panel",affiliate_network:"direct_vendor",vendor_name:link.dataset.dealVendor||"",affiliate_url:link.href});}));
    // Header button count = time-sensitive deals only (ending + live + upcoming).
    const b=dealBuckets(all);
    const count=b.ending.length+b.live.length+b.upcoming.length;
    document.querySelectorAll("[data-deals-open]").forEach(btn=>{
      btn.addEventListener("click",openDealsPanel);
      const badge=btn.querySelector("[data-deals-count]");
      if(badge){ if(count>0){ badge.textContent=String(count); badge.hidden=false; } else { badge.hidden=true; } }
    });
    document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeDealsPanel(); });
  }
  function setupPromotionRolodex(promotions){
    const saleCard=document.querySelector("[data-sale-card]");
    if(!saleCard) return;
    const banner=document.querySelector(".sale-banner");
    const saleCount=document.querySelector("[data-sale-count]");
    const headline=document.querySelector(".sale-headline");
    const kicker=document.querySelector(".sale-mobile-kicker span:nth-child(2)");
    const hint=document.querySelector(".sale-mobile-hint");
    const subline=document.querySelector(".sale-subline");
    const prev=document.querySelector("[data-sale-prev]");
    const next=document.querySelector("[data-sale-next]");
    if(headline)headline.textContent="📣 Announcements";
    if(kicker)kicker.textContent="Announcements";
    if(hint)hint.textContent="Tap to view";
    if(subline)subline.innerHTML=`<button class="sale-view-all" type="button" data-deals-scroll>View all deals →</button>`;
    const scrollToDeals=event=>{
      event.preventDefault();
      const target=document.querySelector("#deals");
      if(target){
        const sticky=document.querySelector(".sticky-stack");
        const stickyHeight=sticky?sticky.getBoundingClientRect().height:0;
        const extraSpace=window.matchMedia("(max-width: 620px)").matches?14:18;
        const top=target.getBoundingClientRect().top+window.pageYOffset-stickyHeight-extraSpace;
        window.scrollTo({top:Math.max(0,top),behavior:"smooth"});
      }
      window.dataLayer=window.dataLayer||[];
      window.dataLayer.push({event:"promo_section_click",product_name:"Limited Time Deals",product_category:"promotion",button_text:"View deals",button_location:"announcement_rolodex"});
    };
    // Reads the explicit announcement flag. It used to filter on
    // show_in_announcement_rolodex, which was set by ticking "Deal carousel",
    // so ticking "Announcement strip" did nothing and only entries whose tube
    // happened to be "New partner" or whose vendor matched "skool" ever showed.
    const announcementPromos=promotions.filter(p=>p.show_in_announcement===true).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0));
    const slides=[{static:true},...announcementPromos];
    let current=0;let autoTimer;
    const render=()=>{
      const slide=slides[current];
      saleCard.classList.toggle("sale-deal-card--promo",!slide.static);
      if(slide.static){
        saleCard.href="#deals";
        saleCard.removeAttribute("target");
        saleCard.removeAttribute("rel");
        saleCard.removeAttribute("data-vendor");
        saleCard.setAttribute("aria-label","View current deals");
        saleCard.innerHTML=`<span class="sale-vendor">Limited Time Deals</span><span class="sale-pct"><strong>LIMITED TIME VENDOR DEALS</strong> Save up to 55% off</span><span class="sale-cta-chip">View deals</span>`;
      }else{
        const logo=dealLogoPath(slide.display_vendor||slide.vendor);
        const logoHtml=logo?`<img class="sale-vendor-logo" src="${escapeHtml(logo)}" alt="" loading="lazy">`:"";
        const kickerText=slide.rolodex_kicker||"";
        saleCard.href=slide.affiliate_url||"#";
        saleCard.target="_blank";
        saleCard.rel="nofollow sponsored noopener";
        saleCard.dataset.vendor=slide.vendor||"";
        saleCard.setAttribute("aria-label",slide.headline||slide.vendor||"View promotion");
        saleCard.innerHTML=`<span class="sale-vendor-wrap">${logoHtml}<span class="sale-vendor">${escapeHtml(slide.display_vendor||slide.vendor)}</span></span><span class="sale-pct">${kickerText?`<strong>${escapeHtml(kickerText)}</strong> `:""}${escapeHtml(slide.short_detail||"")}</span><span class="sale-cta-chip">${escapeHtml(slide.cta_text||"View deal")}</span>`;
      }
      if(saleCount)saleCount.textContent=`${current+1} / ${slides.length}`;
    };
    const goTo=i=>{current=(i+slides.length)%slides.length;render();resetTimer();};
    const resetTimer=()=>{clearInterval(autoTimer);if(slides.length>1)autoTimer=setInterval(()=>goTo(current+1),6000);};
    if(prev){
      const hide=slides.length<2;
      prev.hidden=hide;prev.setAttribute("aria-hidden",String(hide));
      prev.addEventListener("click",()=>goTo(current-1));
    }
    if(next){
      const hide=slides.length<2;
      next.hidden=hide;next.setAttribute("aria-hidden",String(hide));
      next.addEventListener("click",()=>goTo(current+1));
    }
    saleCard.addEventListener("click",event=>{
      const slide=slides[current];
      if(slide.static){scrollToDeals(event);return;}
      window.dataLayer=window.dataLayer||[];
      window.dataLayer.push({event:"affiliate_click",product_name:slide.headline||slide.vendor,product_category:"promotion",button_text:slide.cta_text||"View deal",button_location:"announcement_rolodex",vendor_name:slide.vendor||"",affiliate_url:slide.affiliate_url||""});
    });
    document.querySelectorAll("[data-deals-scroll]").forEach(button=>button.addEventListener("click",scrollToDeals));
    render();
    resetTimer();
    if(banner)banner.hidden=false;
  }

  // A promotion is an announcement (new partner, community news) rather than a
  // deal. Announcements live only in the rotating strip; deals live only in the
  // Deals panel and the carousel. One job per surface, nothing duplicated.

  function setupDealsStrip(promotions){
    const scroll=document.querySelector("[data-deals-strip-scroll]");
    if(!scroll) return;
    const boardDeals=promotions.filter(promotion=>promotion.show_in_deals===true);
    if(!boardDeals.length){
      const section=document.querySelector(".deals-strip");
      if(section) section.hidden=true;
      return;
    }
    const isStackable=deal=>{
      const haystack=((deal.short_detail||"")+" "+(deal.full_detail||"")).toLowerCase();
      return haystack.includes("stackable")||haystack.includes("sammyc");
    };
    scroll.innerHTML=boardDeals.map(deal=>{
      const {text:headline}=splitHeadlineBadge(deal.headline);
      const stackChip=isStackable(deal)?`<span class="deals-pill-stack">+SAMMYC</span>`:"";
      return `<a class="deals-pill" href="${escapeHtml(deal.affiliate_url||"#")}" target="_blank" rel="nofollow sponsored noopener" data-deal-pill data-vendor="${escapeHtml(deal.vendor)}"><span class="deals-pill-vendor">${escapeHtml(deal.display_vendor||deal.vendor)}</span><span class="deals-pill-sep">·</span><span class="deals-pill-headline">${escapeHtml(headline)}</span>${stackChip}</a>`;
    }).join("");
    scroll.querySelectorAll("[data-deal-pill]").forEach(pill=>pill.addEventListener("click",()=>{
      window.dataLayer=window.dataLayer||[];
      window.dataLayer.push({event:"affiliate_click",product_name:"Deals strip pill",product_category:"promotion",button_text:"View deal",button_location:"deals_strip",affiliate_network:"direct_vendor",vendor_name:pill.dataset.vendor||"",affiliate_url:pill.href});
    }));
  }

  const dealLogoPath=vendor=>{
    const key=String(vendor||"").toLowerCase();
    const logos={
      "disguised alpha":"/assets/vendor-logos/disguised-alpha.webp",
      "bioedge research labs":"/assets/vendor-logos/bioedge-research-labs.webp",
      "southern aminos":"/assets/vendor-logos/southern-aminos.webp",
      "mile high peptides":"/assets/vendor-logos/mile-high-peptides.webp",
      "mile high compounds":"/assets/vendor-logos/mile-high-peptides.webp",
      "instant peptides":"/assets/vendor-logos/instant-peptides.webp",
      "solyn labs":"/assets/vendor-logos/solyn-labs.webp",
      "solyn compounds":"/assets/vendor-logos/solyn-labs.webp",
      "glacier aminos":"/assets/vendor-logos/glacier-aminos.webp",
      "ion peptide":"/assets/vendor-logos/ion-peptide.webp",
      "glow aminos":"/assets/vendor-logos/glow-aminos.webp",
      "glow & flawless":"/assets/vendor-logos/glow-aminos.webp",
      "flawless compounds":"/assets/vendor-logos/flawless-compounds.webp",
      "labsourced peptides":"/assets/vendor-logos/labsourced-peptides.webp",
      "labsourced":"/assets/vendor-logos/labsourced-peptides.webp",
      "coffee and peppers":"/assets/vendor-logos/coffee-and-peppers.webp",
      "coffee & peppers":"/assets/vendor-logos/coffee-and-peppers.webp",
      "oneday compounds":"/assets/vendor-logos/oneday-compounds.webp",
      "high tide compounds":"/assets/vendor-logos/high-tide-compounds.webp"
    };
    return logos[key]||"";
  };
  function setupDealCarousel(promotions){
    const track=document.querySelector("[data-deal-track]");
    const dotsWrap=document.querySelector("[data-deal-dots]");
    if(!track) return;
    const deals=promotions.filter(p=>p.show_in_deals===true)
      .slice().sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned));
    if(!deals.length){const s=document.querySelector(".deal-carousel");if(s)s.hidden=true;return;}
    const isStackable=deal=>{const h=((deal.short_detail||"")+" "+(deal.full_detail||"")).toLowerCase();return h.includes("stackable")||h.includes("sammyc");};
    let current=0;let autoTimer;
    const render=()=>{
      const deal=deals[current];
      const{text:headline}=splitHeadlineBadge(deal.headline);
      const badgeHtml=`<span class="dc-badge">${escapeHtml(deal.badge||"Limited Time Deal")}</span>`;
      const stackChip=isStackable(deal)?`<span class="dc-stack">+SAMMYC</span>`:"";
      const logo=dealLogoPath(deal.display_vendor||deal.vendor);
      const logoHtml=logo?`<img class="dc-logo" src="${escapeHtml(logo)}" alt="" width="46" height="30" loading="lazy">`:"";
      const pinClass=deal.pinned?" dc-card--pinned":"";
      const brand=deal.brand_color||"";
      track.innerHTML=`<a class="dc-card${pinClass}"${brand?` style="--bc:${escapeHtml(brand)}"`:""} href="${escapeHtml(deal.affiliate_url||"#")}" target="_blank" rel="nofollow sponsored noopener" data-vendor="${escapeHtml(deal.vendor)}"><div class="dc-card-body"><div class="dc-top">${badgeHtml}<span class="dc-vendor-wrap">${logoHtml}<span class="dc-vendor">${escapeHtml(deal.display_vendor||deal.vendor)}</span></span>${stackChip}</div><strong class="dc-headline">${escapeHtml(headline)}</strong><span class="dc-detail">${escapeHtml(deal.short_detail||"")}</span></div><span class="dc-cta">View Deal ›</span></a>`;
      if(dotsWrap){dotsWrap.innerHTML=deals.map((_,i)=>`<button class="dc-dot${i===current?" active":""}" data-dot="${i}" aria-label="Deal ${i+1}"></button>`).join("");dotsWrap.querySelectorAll("[data-dot]").forEach(d=>d.addEventListener("click",()=>goTo(parseInt(d.dataset.dot))));}
      track.querySelector(".dc-card")&&track.querySelector(".dc-card").addEventListener("click",()=>{window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:"affiliate_click",product_name:"Deal carousel",product_category:"promotion",button_text:"View Deal",button_location:"deal_carousel",vendor_name:deal.vendor,affiliate_url:deal.affiliate_url||""});});
    };
    const goTo=i=>{current=(i+deals.length)%deals.length;render();resetTimer();};
    const resetTimer=()=>{clearInterval(autoTimer);if(deals.length>1)autoTimer=setInterval(()=>goTo(current+1),4000);};
    document.querySelector("[data-deal-prev]")&&document.querySelector("[data-deal-prev]").addEventListener("click",()=>goTo(current-1));
    document.querySelector("[data-deal-next]")&&document.querySelector("[data-deal-next]").addEventListener("click",()=>goTo(current+1));
    let tx=0;
    track.addEventListener("touchstart",e=>{tx=e.touches[0].clientX;},{passive:true});
    track.addEventListener("touchend",e=>{const d=tx-e.changedTouches[0].clientX;if(Math.abs(d)>40)goTo(current+(d>0?1:-1));},{passive:true});
    render();resetTimer();
  }

  function addVendorDirectoryBadges(promotions){
    document.querySelectorAll(".vendor-card").forEach(card=>{
      const name=card.querySelector("h3")?.textContent.trim();
      const related=promotions.filter(promotion=>promotion.vendor===name&&promotion.show_vendor_badge);
      if(!related.length)return;
      const wrap=document.createElement("div");wrap.className="vendor-promo-wrap";
      wrap.innerHTML=related.slice(0,2).map(promotion=>`<span class="vendor-promo-pill">${escapeHtml(promotion.badge||promotion.headline)}</span>`).join("");
      card.querySelector(".vendor-head")?.after(wrap);
    });
  }
  async function loadPromotions(){
    try{
      const response=await fetch(PROMOTIONS_URL,{cache:"no-store"});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const payload=await response.json();
      promoState.all=Array.isArray(payload.promotions)?payload.promotions:[];
      promoState.active=promoState.all.filter(promotion=>isPromotionActive(promotion)).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0));
      promoState.loaded=true;
      setupPromotionPanel(promoState.active);
      // Merged only into the rolodex input: promoState stays purely promotions,
      // so the deals panel and carousel are unaffected.
      // Giveaways are kept out of promoState so the deals panel, carousel and
      // vendor badges never see them. They are exposed separately and merged
      // only by the announcement bar.
      announcementGiveaways().then(gw=>{ promoState.giveawayAnnouncements=gw; });
      setupPromotionRolodex(promoState.active);
      setupDealCarousel(promoState.active);
      setupDealsPanel(promoState.all);
      addVendorDirectoryBadges(promoState.active);
      document.dispatchEvent(new CustomEvent("mpp:promotions-ready"));
      return promoState.active;
    }catch(error){
      console.warn("Promotions unavailable",error.message);
      promoState.loaded=true;
      document.dispatchEvent(new CustomEvent("mpp:promotions-ready"));
      return [];
    }
  }
  // Giveaways can opt into the announcement bar, same two-surface model as
  // deals. They live in their own data file, so they are fetched here and
  // reshaped into the slide form the rolodex already renders.
  async function announcementGiveaways(){
    try{
      const response=await fetch("/data/giveaways-public.json",{cache:"no-store"});
      if(!response.ok) return [];
      const data=await response.json();
      const DAY=86400000;
      const now=Date.now();
      return (data.giveaways||[])
        .filter(g=>g.show_in_announcement===true)
        .filter(g=>{
          const start=new Date(`${g.start_date}T00:00:00`).getTime();
          const end=new Date(`${g.end_date}T00:00:00`).getTime()+DAY-1;
          return Number.isFinite(start)&&Number.isFinite(end)&&now>=start&&now<=end;
        })
        .map(g=>({
          vendor:g.host, display_vendor:g.host,
          headline:g.title,
          affiliate_url:g.entry_url,
          rolodex_kicker:"Giveaway",
          announce_tube:"Giveaway",
          priority:g.featured?250:120,
          show_in_announcement:true
        }));
    }catch{ return []; }
  }
  const promotionsReady=loadPromotions();
  // announcements() is what the announcement bar reads: promotions flagged for
  // it, plus any giveaway that opted in. Deliberately separate from active(),
  // which stays promotions-only.
  const announcementSlides=()=>[
    ...activePromotions().filter(p=>p.show_in_announcement===true),
    ...(promoState.giveawayAnnouncements||[])
  ];
  window.MPPPromotions={ready:promotionsReady,active:activePromotions,announcements:announcementSlides,forOffer:offerPromotions,forOfferAll:offerPromotionsAll,openPanel:openPromotionPanel};

  initComplianceGate();
})();

/* ============================================================
   Coupon copy, delegated
   One document-level listener covers the live catalog (rows are
   re-rendered constantly) and the static compound and vendor
   pages, with no double-binding and nothing to re-attach.
   ============================================================ */
(function(){
  "use strict";
  function writeClipboard(text){
    if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function(resolve,reject){
      try{
        var field=document.createElement("textarea");
        field.value=text;
        field.setAttribute("readonly","");
        field.style.cssText="position:absolute;left:-9999px;top:0;";
        document.body.appendChild(field);
        field.select();
        var ok=document.execCommand("copy");
        document.body.removeChild(field);
        ok?resolve():reject(new Error("copy rejected"));
      }catch(error){reject(error);}
    });
  }
  document.addEventListener("click",function(event){
    var button=event.target.closest?event.target.closest("[data-copy-code]"):null;
    if(!button) return;
    // The button is layered above the row's stretched outbound link, so the
    // click must not also register as an affiliate click.
    event.preventDefault();
    event.stopPropagation();
    var code=button.getAttribute("data-copy-code")||"";
    if(!code) return;
    var label=button.querySelector(".supplier-copy-text")||button;
    var original=button.getAttribute("data-copy-label")||label.textContent;
    button.setAttribute("data-copy-label",original);
    writeClipboard(code).then(function(){
      button.classList.add("is-copied");
      label.textContent="Copied";
      clearTimeout(button._copyTimer);
      button._copyTimer=setTimeout(function(){
        button.classList.remove("is-copied");
        label.textContent=original;
      },1800);
      window.dataLayer=window.dataLayer||[];
      window.dataLayer.push({
        event:"coupon_copy",
        discount_code:code,
        vendor_name:button.getAttribute("data-vendor")||"",
        product_name:button.getAttribute("data-product")||"",
        button_location:button.getAttribute("data-copy-location")||"comparison_card"
      });
    }).catch(function(){
      // Clipboard blocked. Show the code so it can still be selected by hand.
      label.textContent=code;
    });
  });
})();

/* ============================================================
   Sticky best-price bar, single-product pages only
   Appears once the price table has scrolled out of view, so the
   cheapest tracked listing stays one tap away on mobile.
   ============================================================ */
(function(){
  "use strict";
  var bar=document.querySelector("[data-sticky-best]");
  if(!bar) return;
  var anchor=document.querySelector("[data-sticky-anchor]");
  if(!anchor){ return; }
  var link=bar.querySelector("[data-affiliate]");
  if(link){
    link.addEventListener("click",function(){
      window.dataLayer=window.dataLayer||[];
      window.dataLayer.push({
        event:"affiliate_click",
        product_name:link.getAttribute("data-product")||"",
        product_category:link.getAttribute("data-category")||"",
        lab_result:"tracked_vendor",
        button_text:link.getAttribute("data-cta")||"Get best price",
        button_location:"sticky_best_price_bar",
        affiliate_network:"direct_vendor",
        vendor_name:link.getAttribute("data-vendor")||"",
        discount_code:link.getAttribute("data-code")||"",
        affiliate_url:link.href
      });
    });
  }
  function show(on){ bar.classList.toggle("is-visible",on); }
  // The anchor is a zero-height sentinel sitting just above the price table,
  // not the table itself. Observing the table meant waiting for all ~3000px of
  // it to clear the viewport, so the bar only appeared once the reader was well
  // past the FAQ. The sentinel fires the moment the cheapest row scrolls off,
  // which is exactly when a shortcut back to it becomes useful.
  if("IntersectionObserver" in window){
    new IntersectionObserver(function(entries){
      entries.forEach(function(entry){ show(!entry.isIntersecting&&entry.boundingClientRect.top<0); });
    },{threshold:0}).observe(anchor);
  }else{
    window.addEventListener("scroll",function(){
      show(anchor.getBoundingClientRect().top<0);
    },{passive:true});
  }
})();

/* ============================================================
   Giveaways
   Mirrors the Deals pill but is a completely separate surface:
   giveaways never appear in Today's Deals, the carousel, or the
   announcement strip. The pill is injected next to the Deals
   button rather than added to 127 HTML files, so every page
   picks it up automatically.
   Live/upcoming/ended is worked out here from the dates, so a
   giveaway ends on time without a redeploy.
   ============================================================ */
(function(){
  "use strict";
  const DAY = 86400000;
  let panelRoot = null;

  const esc = value => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // The dates are plain calendar days, not instants, so the state is worked out
  // by comparing YYYY-MM-DD strings in the giveaway's own timezone. Parsing them
  // into Date objects used the browser's timezone instead, so the same giveaway
  // read as "upcoming" in New York and "live" in Sydney. String comparison on
  // ISO dates sorts correctly and has no timezone maths to get wrong.
  function dayKey(ms, zone){
    return new Date(ms).toLocaleDateString("en-CA", { timeZone: zone || "America/New_York" });
  }
  function bucket(giveaway, now){
    const start = String(giveaway.start_date || "");
    const end = String(giveaway.end_date || "");
    if (!start || !end) return "ended";
    const today = dayKey(now, giveaway.timezone);
    if (start > today) return "upcoming";
    if (end < today) return "ended";                 // end date is inclusive
    // "Ending" means the last three days of the window, counted in whole days.
    const soon = dayKey(now + 3 * DAY, giveaway.timezone);
    return end <= soon ? "ending" : "live";
  }

  function cardMarkup(giveaway, state){
    // Always the actual date. The dates are plain calendar strings, not
    // instants, so they are formatted from their parts: parsing "2026-08-01"
    // and formatting it in another timezone shifted it to "Jul 31".
    const pretty = date => {
      const [y, m, d] = String(date || "").split("-").map(Number);
      if (!y || !m || !d) return String(date || "");
      return new Date(Date.UTC(y, m - 1, d))
        .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    };
    const when = state === "upcoming"
      ? `Opens ${pretty(giveaway.start_date)}`
      : `Ends ${pretty(giveaway.end_date)}`;
    const partner = giveaway.is_partner
      ? `<span class="gw-partner">With ${esc(giveaway.host)}</span>` : "";
    const prize = giveaway.prize ? `<span class="gw-prize">${esc(giveaway.prize)}</span>` : "";
    const image = giveaway.image
      ? `<img class="gw-image" src="${esc(giveaway.image)}" alt="" loading="lazy"/>` : "";
    const rules = giveaway.rules_url
      ? `<a class="gw-rules" href="${esc(giveaway.rules_url)}" target="_blank" rel="noopener">Official rules</a>` : "";
    const cta = state === "upcoming"
      ? `<span class="gw-cta is-soon">Opens soon</span>`
      : `<a class="gw-cta" href="${esc(giveaway.entry_url)}" target="_blank" rel="nofollow noopener" data-gw-enter="1" data-gw-id="${esc(giveaway.id)}" data-gw-host="${esc(giveaway.host)}">${esc(giveaway.cta_text || "Enter now")}</a>`;
    return `<article class="gw-card${state === "ending" ? " is-ending" : ""}">
      ${image}
      <div class="gw-head"><span class="gw-when">${when}</span>${partner}</div>
      <h3 class="gw-title">${esc(giveaway.title)}</h3>
      ${prize}
      ${giveaway.description ? `<p class="gw-desc">${esc(giveaway.description)}</p>` : ""}
      <div class="gw-foot">${cta}${rules}</div>
    </article>`;
  }

  function panelMarkup(groups, now){
    const section = (title, list) => list.length
      ? `<section class="gw-group"><h4 class="gw-group-title">${title} <span>${list.length}</span></h4>
          ${list.map(g => cardMarkup(g, g._state)).join("")}</section>` : "";
    return `<div class="gw-backdrop" data-gw-panel role="dialog" aria-modal="true" aria-label="Current giveaways">
      <div class="gw-panel">
        <header class="gw-panel-head">
          <span class="gw-eyebrow">${(groups.ending.length + groups.live.length) ? "Live now" : "Giveaways"}</span>
          <h2>Giveaways</h2>
          <button class="gw-close" type="button" data-gw-close aria-label="Close giveaways">&times;</button>
        </header>
        <div class="gw-panel-body">
          ${(groups.ending.length + groups.live.length + groups.upcoming.length)
            ? `${section("Ending soon", groups.ending)}${section("Live", groups.live)}${section("Opening soon", groups.upcoming)}`
            : `<div class="gw-empty"><span class="gw-empty-mark" aria-hidden="true">&#9734;</span><p class="gw-empty-title">No current giveaways</p><p class="gw-empty-note">Nothing running right now. New ones are posted here as they open, so check back.</p></div>`}
        </div>
        <footer class="gw-panel-foot">Giveaways are run by the named host, not by MyPeptidePrice unless stated. Entry terms, eligibility, and prize fulfilment are the host's responsibility. Research materials are for laboratory research use only.</footer>
      </div>
    </div>`;
  }

  function closePanel(){ if (panelRoot) { panelRoot.classList.remove("is-open"); document.body.style.overflow = ""; } }
  function openPanel(){ if (panelRoot) { panelRoot.classList.add("is-open"); document.body.style.overflow = "hidden"; } }

  function injectPill(count){
    // Sits beside the Deals pill wherever that exists, so the header markup in
    // every page stays untouched.
    document.querySelectorAll(".nav-deals-btn").forEach(deals => {
      if (deals.parentElement.querySelector(".nav-gw-btn")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-gw-btn";
      btn.setAttribute("aria-haspopup", "dialog");
      // The pill is always present so the header does not jump around between
      // an empty week and a busy one. The count badge only appears when there
      // is actually something to enter.
      btn.innerHTML = count > 0
        ? `Giveaways<span class="nav-gw-count">${count}</span>`
        : `Giveaways`;
      if (!count) btn.classList.add("is-empty");
      btn.addEventListener("click", openPanel);
      deals.insertAdjacentElement("afterend", btn);
    });
  }

  async function init(){
    let data;
    try {
      const response = await fetch("/data/giveaways-public.json", { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      data = await response.json();
    } catch { data = { giveaways: [] }; }

    const now = Date.now();
    const all = (data.giveaways || []).map(g => ({ ...g, _state: bucket(g, now) }))
      .filter(g => g._state !== "ended");

    const byFeature = (a, b) => (b.featured === true) - (a.featured === true);
    const groups = {
      ending: all.filter(g => g._state === "ending").sort(byFeature),
      live: all.filter(g => g._state === "live").sort(byFeature),
      upcoming: all.filter(g => g._state === "upcoming").sort(byFeature)
    };

    const holder = document.createElement("div");
    holder.innerHTML = panelMarkup(groups, now);
    panelRoot = holder.firstElementChild;
    document.body.appendChild(panelRoot);
    panelRoot.querySelectorAll("[data-gw-close]").forEach(b => b.addEventListener("click", closePanel));
    panelRoot.addEventListener("click", e => { if (e.target === panelRoot) closePanel(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closePanel(); });
    panelRoot.querySelectorAll("[data-gw-enter]").forEach(link => link.addEventListener("click", () => {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: "giveaway_enter",
        giveaway_id: link.getAttribute("data-gw-id") || "",
        giveaway_host: link.getAttribute("data-gw-host") || "",
        button_location: "giveaways_panel"
      });
    }));

    // Count excludes upcoming: the badge should mean "you can enter this now".
    injectPill(groups.ending.length + groups.live.length);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
