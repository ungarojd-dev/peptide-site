(function(){
  "use strict";

  const COMPLIANCE_KEY="mpp_compliance_session_acceptance_v3";
  const COMPLIANCE_VERSION="2026-06-04-v3";
  const EXEMPT_PATHS=new Set(["/terms.html","/privacy.html","/disclaimer.html","/404.html"]);

  const toggle=document.querySelector("[data-nav-toggle]");
  const nav=document.querySelector("[data-site-nav]");
  if(toggle&&nav) toggle.addEventListener("click",()=>nav.classList.toggle("show"));
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

  const summerDeals=[
    {vendor:"Southern Aminos",line:"25% off sitewide",detail:"+ extra 15% off with code SAMMYC",href:"https://southernaminos.com/?coupon=sammyc"},
    {vendor:"Instant Peptides",line:"15% off sitewide",detail:"+ extra 15% off with code SAMMYC",href:"https://instantpeptides.com?ref=SAMMYC"},
    {vendor:"Glow Aminos",line:"20% off sitewide",detail:"+ stackable pack deals, extra savings with code SAMMYC",href:"https://glowaminos.com/?ref=sammyc&coupon=SammyC"},
    {vendor:"Flawless Compounds",line:"20% off sitewide",detail:"+ stackable pack deals, extra savings with code SAMMYC",href:"https://flawlesscompounds.com/shop/?coupon=SammyC"}
  ];
  const saleCard=document.querySelector("[data-sale-card]");
  if(saleCard&&summerDeals.length){
    const saleCount=document.querySelector("[data-sale-count]");
    let saleIndex=0;
    let saleTimer;
    const renderSale=()=>{
      const deal=summerDeals[saleIndex];
      saleCard.href=deal.href;
      saleCard.setAttribute("aria-label",`${deal.vendor} summer sale, ${deal.line}, ${deal.detail}`);
      saleCard.dataset.vendor=deal.vendor;
      saleCard.innerHTML=`<span class="sale-vendor">${escapeHtml(deal.vendor)}</span><span class="sale-pct"><strong>${escapeHtml(deal.line)}</strong> ${escapeHtml(deal.detail)}</span><span class="sale-cta-chip">View deal</span>`;
      if(saleCount) saleCount.textContent=`${saleIndex+1} / ${summerDeals.length}`;
      saleCard.classList.remove("sale-flip-in");
      requestAnimationFrame(()=>requestAnimationFrame(()=>saleCard.classList.add("sale-flip-in")));
    };
    const rotate=direction=>{saleIndex=(saleIndex+direction+summerDeals.length)%summerDeals.length;renderSale()};
    const restart=()=>{clearInterval(saleTimer);saleTimer=setInterval(()=>rotate(1),3600)};
    document.querySelector("[data-sale-prev]")?.addEventListener("click",()=>{rotate(-1);restart()});
    document.querySelector("[data-sale-next]")?.addEventListener("click",()=>{rotate(1);restart()});
    saleCard.addEventListener("click",()=>{window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:"affiliate_click",product_name:"Summer sales rolodex",product_category:"promotion",lab_result:"tracked_vendor",button_text:"View deal",button_location:"summer_sales_rolodex",affiliate_network:"direct_vendor",vendor_name:saleCard.dataset.vendor||"",affiliate_url:saleCard.href})});
    renderSale();
    restart();
  }

  initComplianceGate();
})();
