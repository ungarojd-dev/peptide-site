(function(){
  "use strict";
  const toggle=document.querySelector("[data-nav-toggle]");
  const nav=document.querySelector("[data-site-nav]");
  if(toggle&&nav) toggle.addEventListener("click",()=>nav.classList.toggle("show"));
  document.querySelectorAll("[data-year]").forEach(node=>node.textContent=String(new Date().getFullYear()));
  const modal=document.querySelector("[data-disclaimer]");
  const accept=document.querySelector("[data-disclaimer-accept]");
  if(modal&&accept){
    const key="mpp_research_disclaimer_accepted";
    if(localStorage.getItem(key)!=="yes") modal.classList.add("show");
    accept.addEventListener("click",()=>{localStorage.setItem(key,"yes");modal.classList.remove("show")});
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
      saleCard.innerHTML=`<span class="sale-vendor">${deal.vendor}</span><span class="sale-pct"><strong>${deal.line}</strong> ${deal.detail}</span><span class="sale-cta-chip">View deal</span>`;
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

})();
