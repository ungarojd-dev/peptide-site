(function(){
  "use strict";

  const COMPLIANCE_KEY="mpp_compliance_session_acceptance_v3";
  const COMPLIANCE_VERSION="2026-06-04-v3";
  const EXEMPT_PATHS=new Set(["/terms.html","/privacy.html","/disclaimer.html","/404.html"]);

  const toggle=document.querySelector("[data-nav-toggle]");
  const nav=document.querySelector("[data-site-nav]");
  if(toggle&&nav) toggle.addEventListener("click",()=>nav.classList.toggle("show"));
  document.querySelectorAll("[data-year]").forEach(node=>node.textContent=String(new Date().getFullYear()));
  document.querySelectorAll("[data-vantyx-supply-link]").forEach(link=>link.addEventListener("click",()=>{window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:"affiliate_click",product_name:"VANTYX Supply homepage banner",product_category:"lab_supplies",button_text:"Shop VANTYX Supply",button_location:"homepage_supply_banner",affiliate_network:"direct_vendor",vendor_name:"VANTYX Supply",affiliate_url:link.href,discount_code:"SAMMYC",discount_percent:10})}));

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
            <div class="mpp-compliance-icon" aria-hidden="true">△</div>
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
    if(hasAcceptedCompliance()) return;
    const root=document.createElement("div");
    root.className="mpp-compliance-root";
    root.innerHTML=complianceMarkup();
    document.body.appendChild(root);
    document.body.classList.add("mpp-compliance-open");

    const card=root.querySelector(".mpp-compliance-card");
    const full=root.querySelector(".mpp-full-disclaimer");
    const checks=[...root.querySelectorAll("[data-compliance-check]")];
    const submit=root.querySelector("[data-compliance-submit]");
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
    });
    const openFull=()=>{card.hidden=true;full.hidden=false;full.querySelector("[data-compliance-full-close]")?.focus()};
    const closeFull=()=>{full.hidden=true;card.hidden=false;root.querySelector("[data-compliance-full-open]")?.focus()};
    root.querySelector("[data-compliance-full-open]").addEventListener("click",openFull);
    root.querySelectorAll("[data-compliance-full-close]").forEach(button=>button.addEventListener("click",closeFull));
    update();
  }

  const PROMOTIONS_URL="/data/promotions.json?v=20260622-cp-newpartner-v9";
  const promoState={all:[],active:[],loaded:false};
  const promotionTime=value=>value?new Date(value).getTime():null;
  const isPromotionActive=(promotion,when=Date.now())=>{
    const starts=promotionTime(promotion.start_at);
    const ends=promotionTime(promotion.end_at);
    return (starts==null||when>=starts)&&(ends==null||when<=ends);
  };
  const promotionAppliesToOffer=(promotion,supplier={},card={})=>{
    if(promotion.vendor!==supplier.vendor_name) return false;
    const categories=promotion.applicable_categories||[];
    const terms=promotion.match_terms||[];
    if(!categories.length&&!terms.length) return true;
    const haystack=[card.name,card.category,card.format,supplier.raw_product,supplier.raw_listing,supplier.sku].filter(Boolean).join(" ").toLowerCase();
    return categories.includes(card.category)||terms.some(term=>haystack.includes(String(term).toLowerCase()));
  };
  const activePromotions=()=>promoState.active;
  const offerPromotions=(supplier,card)=>activePromotions().filter(promotion=>promotion.show_vendor_badge&&promotionAppliesToOffer(promotion,supplier,card));
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
  const splitHeadlineBadge=headline=>{
    const fdMatch=String(headline||"").match(/^Father's Day:\s*(.+)$/);
    return fdMatch?{badge:"Father's Day",text:fdMatch[1]}:{badge:null,text:headline};
  };
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
    if(saleCount)saleCount.textContent="1 / 1";
    if(prev){prev.hidden=true;prev.setAttribute("aria-hidden","true");}
    if(next){next.hidden=true;next.setAttribute("aria-hidden","true");}
    if(subline)subline.innerHTML=`<button class="sale-view-all" type="button" data-fathers-day-scroll>View all Father's Day deals →</button>`;
    const renderStaticCta=()=>{
      saleCard.href="#deals";
      saleCard.removeAttribute("target");
      saleCard.removeAttribute("rel");
      saleCard.setAttribute("aria-label","View Father's Day deals");
      saleCard.dataset.vendor="Father's Day Deals";
      saleCard.innerHTML=`<span class="sale-vendor">Father's Day Deals</span><span class="sale-pct"><strong>Check out current Father's Day deals</strong> from supported vendors.</span><span class="sale-cta-chip">View deals</span>`;
    };
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
      window.dataLayer.push({event:"promo_section_click",product_name:"Father's Day deals",product_category:"promotion",button_text:"View deals",button_location:"announcement_rolodex"});
    };
    renderStaticCta();
    saleCard.addEventListener("click",scrollToDeals);
    document.querySelectorAll("[data-fathers-day-scroll]").forEach(button=>button.addEventListener("click",scrollToDeals));
    if(banner)banner.hidden=false;
  }

  function setupDealsStrip(promotions){
    const scroll=document.querySelector("[data-deals-strip-scroll]");
    if(!scroll) return;
    const boardDeals=promotions.filter(promotion=>promotion.show_in_rolodex!==false);
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
      "coffee & peppers":"/assets/vendor-logos/coffee-and-peppers.webp"
    };
    return logos[key]||"";
  };
  function setupDealCarousel(promotions){
    const track=document.querySelector("[data-deal-track]");
    const dotsWrap=document.querySelector("[data-deal-dots]");
    if(!track) return;
    const deals=promotions.filter(p=>p.show_in_rolodex===true);
    if(!deals.length){const s=document.querySelector(".deal-carousel");if(s)s.hidden=true;return;}
    const isStackable=deal=>{const h=((deal.short_detail||"")+" "+(deal.full_detail||"")).toLowerCase();return h.includes("stackable")||h.includes("sammyc");};
    let current=0;let autoTimer;
    const render=()=>{
      const deal=deals[current];
      const{text:headline}=splitHeadlineBadge(deal.headline);
      const badgeHtml=`<span class="dc-badge">${escapeHtml(deal.badge||"Father's Day Deal")}</span>`;
      const stackChip=isStackable(deal)?`<span class="dc-stack">+SAMMYC</span>`:"";
      const logo=dealLogoPath(deal.display_vendor||deal.vendor);
      const logoHtml=logo?`<img class="dc-logo" src="${escapeHtml(logo)}" alt="" loading="lazy">`:"";
      track.innerHTML=`<a class="dc-card" href="${escapeHtml(deal.affiliate_url||"#")}" target="_blank" rel="nofollow sponsored noopener" data-vendor="${escapeHtml(deal.vendor)}"><div class="dc-card-body"><div class="dc-top">${badgeHtml}<span class="dc-vendor-wrap">${logoHtml}<span class="dc-vendor">${escapeHtml(deal.display_vendor||deal.vendor)}</span></span>${stackChip}</div><strong class="dc-headline">${escapeHtml(headline)}</strong><span class="dc-detail">${escapeHtml(deal.short_detail||"")}</span></div><span class="dc-cta">View Deal ›</span></a>`;
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
      setupPromotionRolodex(promoState.active);
      setupDealCarousel(promoState.active);
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
  const promotionsReady=loadPromotions();
  window.MPPPromotions={ready:promotionsReady,active:activePromotions,forOffer:offerPromotions,openPanel:openPromotionPanel};

  initComplianceGate();
})();
