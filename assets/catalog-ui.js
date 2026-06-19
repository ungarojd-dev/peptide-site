(function(global){
  "use strict";

  const CATEGORY_ORDER=["All","GLP-1 & Incretin","Repair & Recovery","Growth Hormone Research","Cognitive & Nootropic","Longevity & Cellular Health","Metabolic & Mitochondrial","Bioregulators","Skin, Tanning & Sexual Health","Supplies","Other"];
  const FORMAT_ORDER=["All","Vials","Capsules","Dissolvable Strips","Nasal Sprays","Topicals","Liquids","Aminos","Bioregulators","Supplies"];
  const ALL_VARIANTS="__all__";
  const state={catalog:null,cards:[],query:"",category:"All",format:"All",vendor:"All",sort:"price",activeVariants:{},expanded:{},source:"Loading"};
  const $=id=>document.getElementById(id);
  const esc=value=>String(value==null?"":value).replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
  const attr=value=>esc(value).replace(/'/g,"&#39;");
  const normalizedListing=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  const normalizeFilterValue=value=>String(value||"").replace(/&amp;/g,"&").replace(/\s+/g," ").trim().toLowerCase();
  const matchesFilterValue=(value,selected)=>normalizeFilterValue(value)===normalizeFilterValue(selected);

  function json(url,ms=10000){
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),ms);
    return fetch(url,{signal:ctrl.signal,cache:"no-store"}).then(response=>{
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json().then(data=>({data,response}));
    }).finally(()=>clearTimeout(timer));
  }

  function initials(name){return String(name||"?").split(/\s+/).map(word=>word[0]).join("").slice(0,2).toUpperCase();}
  function money(value){return value!=null&&Number.isFinite(Number(value))?`$${Number(value).toFixed(2)}`:null;}
  function filterValues(order,property){
    const found=new Set(state.cards.map(card=>card[property]).filter(Boolean));
    const ordered=order.filter(item=>item==="All"||Array.from(found).some(value=>matchesFilterValue(value,item)));
    const extras=Array.from(found).filter(value=>!ordered.some(item=>matchesFilterValue(item,value))).sort((a,b)=>String(a).localeCompare(String(b)));
    return [...ordered,...extras];
  }
  function chip(label,active){return `<button type="button" class="catalog-chip${active?" active":""}" data-chip="${attr(label)}">${esc(label)}</button>`;}
  function option(label,active){return `<option value="${attr(label)}"${active?" selected":""}>${esc(label)}</option>`;}
  function setSelectOptions(select,values,selected){
    if(!select) return;
    select.innerHTML=values.map(label=>option(label,matchesFilterValue(label,selected))).join("");
    const hasSelected=values.some(label=>matchesFilterValue(label,selected));
    select.value=hasSelected?values.find(label=>matchesFilterValue(label,selected)):"All";
  }
  function categoryClass(category){
    const value=String(category||"").toLowerCase();
    if(value.includes("glp")||value.includes("incretin")) return "tone-glp";
    if(value.includes("repair")||value.includes("recovery")) return "tone-recovery";
    if(value.includes("growth")||value.includes("hormone")) return "tone-hormone";
    if(value.includes("skin")||value.includes("tanning")||value.includes("sexual")) return "tone-skin";
    if(value.includes("cognitive")||value.includes("nootropic")) return "tone-cognitive";
    if(value.includes("metabolic")||value.includes("mitochondrial")) return "tone-metabolic";
    if(value.includes("supply")) return "tone-supplies";
    return "tone-default";
  }
  function moleculeIcon(){
    return `<span class="product-molecule" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></span>`;
  }

  function allOffers(card){
    return (card.variants||[]).flatMap(variant=>(variant.suppliers||[]).map(supplier=>({variant,supplier}))).sort((a,b)=>{
      const pa=a.supplier.effective_price_min==null?Number.POSITIVE_INFINITY:a.supplier.effective_price_min;
      const pb=b.supplier.effective_price_min==null?Number.POSITIVE_INFINITY:b.supplier.effective_price_min;
      return pa-pb||String(a.variant.label||"").localeCompare(String(b.variant.label||""))||String(a.supplier.vendor_name||"").localeCompare(String(b.supplier.vendor_name||""));
    });
  }
  function bestOffer(card){const offers=offersForCard(card);return offers.find(o=>o.supplier.effective_price_min!=null)||offers[0]||null;}
  function selectedVariantId(card){return state.activeVariants[card.id]||ALL_VARIANTS;}
  function activeVariant(card){const selected=selectedVariantId(card);return (card.variants||[]).find(variant=>variant.id===selected)||(card.variants||[])[0]||{id:"",label:"Standard listing",suppliers:[]};}
  function searchText(card){return [card.name,card.category,card.format,...(card.variants||[]).flatMap(variant=>(variant.suppliers||[]).flatMap(supplier=>[supplier.vendor_name,supplier.raw_product,supplier.raw_listing,supplier.sku]))].join(" ").toLowerCase();}
  function cardVendors(card){return new Set((card.variants||[]).flatMap(variant=>(variant.suppliers||[]).map(supplier=>String(supplier.vendor_name||"").trim())).filter(Boolean));}
  function cardHasVendor(card,vendor){return vendor==="All"||Array.from(cardVendors(card)).some(name=>matchesFilterValue(name,vendor));}
  function offerMatchesVendor(offer){return state.vendor==="All"||matchesFilterValue(offer?.supplier?.vendor_name,state.vendor);}
  function offersForCard(card){return allOffers(card).filter(offerMatchesVendor);}
  function allVendorNames(){const set=new Map();state.cards.forEach(card=>cardVendors(card).forEach(name=>set.set(normalizeFilterValue(name),name)));return Array.from(set.values()).sort((a,b)=>a.localeCompare(b));}

  function cards(){
    const query=state.query.trim().toLowerCase();
    const filtered=state.cards.filter(card=>(state.category==="All"||matchesFilterValue(card.category,state.category))&&(state.format==="All"||matchesFilterValue(card.format,state.format))&&cardHasVendor(card,state.vendor)&&(!query||searchText(card).includes(query)));
    return filtered.sort((a,b)=>{
      if(state.sort==="vendors") return Number(b.supplier_count||0)-Number(a.supplier_count||0)||String(a.name||"").localeCompare(String(b.name||""));
      if(state.sort==="name") return String(a.name||"").localeCompare(String(b.name||""));
      const pa=bestOffer(a)?.supplier?.effective_price_min??Number.POSITIVE_INFINITY;
      const pb=bestOffer(b)?.supplier?.effective_price_min??Number.POSITIVE_INFINITY;
      return pa-pb||String(a.name||"").localeCompare(String(b.name||""));
    });
  }

  function renderFilters(){
    const categoryValues=filterValues(CATEGORY_ORDER,"category");
    const formatValues=filterValues(FORMAT_ORDER,"format");
    const vendorValues=["All",...allVendorNames()];

    const categorySelect=$("catalogCategorySelect");
    const formatSelect=$("catalogFormatSelect");
    const vendorSelect=$("catalogVendorSelect");
    setSelectOptions(categorySelect,categoryValues,state.category);
    setSelectOptions(formatSelect,formatValues,state.format);
    setSelectOptions(vendorSelect,vendorValues,state.vendor);

    if(categorySelect) categorySelect.onchange=event=>{state.category=event.target.value;renderFilters();renderCards(true);};
    if(formatSelect) formatSelect.onchange=event=>{state.format=event.target.value;renderFilters();renderCards(true);};
    if(vendorSelect) vendorSelect.onchange=event=>{state.vendor=event.target.value;renderFilters();renderCards(true);};

    const categories=$("catalogCategories");
    const formats=$("catalogFormats");
    const vendors=$("catalogVendors");
    if(categories) categories.innerHTML=categoryValues.map(label=>chip(label,matchesFilterValue(label,state.category))).join("");
    if(formats) formats.innerHTML=formatValues.map(label=>chip(label,matchesFilterValue(label,state.format))).join("");
    if(vendors) vendors.innerHTML=vendorValues.map(label=>chip(label,matchesFilterValue(label,state.vendor))).join("");
    document.querySelectorAll("#catalogCategories [data-chip]").forEach(button=>button.onclick=()=>{state.category=button.dataset.chip;renderFilters();renderCards(true);});
    document.querySelectorAll("#catalogFormats [data-chip]").forEach(button=>button.onclick=()=>{state.format=button.dataset.chip;renderFilters();renderCards(true);});
    document.querySelectorAll("#catalogVendors [data-chip]").forEach(button=>button.onclick=()=>{state.vendor=button.dataset.chip;renderFilters();renderCards(true);});
    bindChipsScroll();
    updateChipsOverflow();
  }

  function updateChipsOverflow(){
    document.querySelectorAll("[data-chips-shell]").forEach(shell=>{
      const chips=shell.querySelector(".catalog-chips");
      if(!chips) return;
      const overflow=chips.scrollWidth>chips.clientWidth+2;
      shell.classList.toggle("has-overflow",overflow);
    });
  }

  function bindChipsScroll(){
    document.querySelectorAll('[data-action="chips-scroll"]').forEach(button=>{
      if(button.dataset.bound) return;
      button.dataset.bound="1";
      button.addEventListener("click",()=>{
        const shell=button.closest("[data-chips-shell]");
        const chips=shell?.querySelector(".catalog-chips");
        if(chips) chips.scrollBy({left:Number(button.dataset.dir)*160,behavior:"smooth"});
      });
    });
    document.querySelectorAll(".catalog-chips").forEach(chips=>{
      if(chips.dataset.scrollBound) return;
      chips.dataset.scrollBound="1";
      chips.addEventListener("scroll",updateChipsOverflow,{passive:true});
    });
    if(global.ResizeObserver&&!global.__mppChipsObserverBound){
      global.__mppChipsObserverBound=true;
      const ro=new ResizeObserver(updateChipsOverflow);
      document.querySelectorAll(".catalog-chips").forEach(el=>ro.observe(el));
    }
  }

  function updateStats(){
    const catalog=state.catalog||{};
    const set=(id,value)=>{const node=$(id);if(node)node.textContent=String(value||0);};
    set("statCards",catalog.product_card_count||state.cards.length||0);
    set("statOffers",catalog.normalized_offer_count||catalog.mapped_offer_count||0);
    set("statVendors",catalog.vendors_loaded||0);
  }

  function supplierRow(supplier,card,variantLabel="",isBest=false){
    const logo=supplier.vendor_logo?`<img class="supplier-logo" src="${attr(supplier.vendor_logo)}" alt="${attr(supplier.vendor_name)} logo" loading="lazy" width="34" height="34"/>`:`<span class="supplier-initials">${esc(initials(supplier.vendor_name))}</span>`;
    const regular=supplier.discount_percent>0&&supplier.regular_price_label!==supplier.effective_price_label?`<div class="supplier-regular">${esc(supplier.regular_price_label)}</div>`:"";
    const stock=supplier.in_stock===false?`<span class="supplier-oos">Out of stock</span>`:`<span>Listed</span>`;
    const alternate=supplier.alternate_offer_count?`<span>${esc(Number(supplier.alternate_offer_count)+1)} listings</span>`:"";
    const listingName=supplier.raw_listing||supplier.raw_product||"";
    const productListing=listingName&&normalizedListing(listingName)!==normalizedListing(card.name)?`<div class="supplier-listing">${esc(listingName)}</div>`:"";
    const variantLine=variantLabel&&variantLabel!=="Standard listing"?`<span class="supplier-variant-line"><span>Size</span> ${esc(variantLabel)}</span>`:"";
    const discount=supplier.discount_percent?`<span class="supplier-discount">${esc(supplier.discount_percent)}% off with ${esc(supplier.coupon_code||"SAMMYC")}</span>`:`<span class="supplier-discount">Code details on vendor site</span>`;
    const bestBadge=isBest?`<span class="supplier-best">Lowest</span>`:"";
    const promotions=global.MPPPromotions?.forOffer?.(supplier,card)||[];
    const promoBadges=promotions.length?`<div class="supplier-promos">${promotions.slice(0,2).map(promotion=>`<span class="supplier-promo-badge">${esc(promotion.badge||promotion.headline)}</span>`).join("")}${promotions.length>2?`<span class="supplier-promo-more">+${promotions.length-2} more</span>`:""}</div>`:"";
    return `<a class="supplier-row${isBest?" is-best":""}" href="${attr(supplier.affiliate_url||"#")}" target="_blank" rel="nofollow sponsored noopener" data-affiliate="1" data-product="${attr(card.name)}" data-category="${attr(card.category)}" data-vendor="${attr(supplier.vendor_name)}" data-code="${attr(supplier.coupon_code||"")}"><div class="supplier-left">${logo}<div class="supplier-copy"><div class="supplier-name-row"><div class="supplier-name">${esc(supplier.vendor_name)}</div>${bestBadge}</div><div class="supplier-meta-line">${variantLine}${stock}${alternate}</div>${productListing}<div class="supplier-sub">${discount}</div>${promoBadges}</div></div><div class="supplier-price-wrap">${regular}<div class="supplier-price">${esc(supplier.effective_price_label||"Contact vendor")}</div><div class="supplier-go">View deal</div></div></a>`;
  }

  function cardHtml(card){
    const selected=selectedVariantId(card);
    const isAll=selected===ALL_VARIANTS;
    const variant=activeVariant(card);
    const expanded=!!state.expanded[card.id];
    const rows=(isAll?allOffers(card):(variant.suppliers||[]).map(supplier=>({supplier,variant})).sort((a,b)=>(a.supplier.effective_price_min??Number.POSITIVE_INFINITY)-(b.supplier.effective_price_min??Number.POSITIVE_INFINITY))).filter(offerMatchesVendor);
    const visible=expanded?rows:rows.slice(0,isAll?4:3);
    const hidden=Math.max(0,rows.length-visible.length);
    const best=bestOffer(card);
    const lowestPrice=best?money(best.supplier.effective_price_min):null;
    const lowestVendor=best?best.supplier.vendor_name:"";
    const tone=categoryClass(card.category);
    const totalListings=rows.length;
    const vendorLabel=state.vendor==="All"?`${esc(card.supplier_count||0)} vendor${card.supplier_count===1?"":"s"}`:`${esc(totalListings)} listing${totalListings===1?"":"s"}`;
    const lowestLabel=state.vendor==="All"?"Lowest tracked price":`Lowest ${esc(state.vendor)} price`;
    const supplierHtml=visible.length?visible.map((row,index)=>supplierRow(row.supplier,card,isAll?row.variant.label:"",index===0&&row.supplier.effective_price_min!=null)).join(""):`<div class="supplier-row supplier-empty-row"><span>No listings available for this vendor.</span></div>`;

    return `<article class="product-card ${tone}">
      <header class="product-card-head">
        <div class="product-card-top">
          ${moleculeIcon()}
          <span class="product-category-badge">${esc(card.category||"Product")}</span>
        </div>
        <div class="product-title-row">
          <div>
            <h2 class="product-title">${esc(card.name)}</h2>
            <div class="product-subtitle">${esc(card.format||"Research product")}</div>
          </div>
          <span class="vendor-count">${vendorLabel}</span>
        </div>
        <div class="card-lowest-block">
          <div class="card-lowest-label">${lowestLabel}</div>
          <div class="card-lowest-price">${lowestPrice?esc(lowestPrice):"Not listed"}</div>
          <div class="card-lowest-vendor">${lowestVendor?`from ${esc(lowestVendor)}`:"Check vendor listings"}</div>
        </div>
        <div class="card-action-row"><button type="button" class="card-view-button" data-action="expand" data-card="${attr(card.id)}">${expanded?"Hide prices":"View prices"}</button></div>
      </header>
      <div class="variant-wrap">
        <span class="variant-label">Compare size or listing</span>
        <div class="variant-pills-shell" data-variant-shell="${attr(card.id)}">
          <button type="button" class="variant-scroll-btn" data-action="variant-scroll" data-dir="-1" data-card="${attr(card.id)}" aria-label="Scroll sizes left">‹</button>
          <div class="variant-pills" data-variant-pills="${attr(card.id)}">
            <button type="button" class="variant-button all${isAll?" active":""}" data-action="variant" data-card="${attr(card.id)}" data-variant="${ALL_VARIANTS}">All listings${totalListings?` (${esc(totalListings)})`:""}</button>
            ${(card.variants||[]).map(item=>`<button type="button" class="variant-button${!isAll&&item.id===variant.id?" active":""}" data-action="variant" data-card="${attr(card.id)}" data-variant="${attr(item.id)}">${esc(item.label)}${item.all_offer_count?` (${esc(item.all_offer_count)})`:""}</button>`).join("")}
          </div>
          <button type="button" class="variant-scroll-btn" data-action="variant-scroll" data-dir="1" data-card="${attr(card.id)}" aria-label="Scroll sizes right">›</button>
        </div>
      </div>
      <div class="supplier-head"><span>Estimated after-code prices</span><span>Low to high</span></div>
      <div class="suppliers">${supplierHtml}</div>
      ${hidden?`<button type="button" class="expand-button" data-action="expand" data-card="${attr(card.id)}">${expanded?"Show fewer listings":`Show ${hidden} more listing${hidden===1?"":"s"}`}</button>`:""}
    </article>`;
  }

  function bindCardActions(){
    document.querySelectorAll('[data-action="variant"]').forEach(button=>button.onclick=()=>{state.activeVariants[button.dataset.card]=button.dataset.variant;state.expanded[button.dataset.card]=true;renderCards(false);});
    document.querySelectorAll('[data-action="expand"]').forEach(button=>button.onclick=()=>{state.expanded[button.dataset.card]=!state.expanded[button.dataset.card];renderCards(false);});
    document.querySelectorAll('[data-action="variant-scroll"]').forEach(button=>button.onclick=()=>{
      const pills=document.querySelector(`[data-variant-pills="${button.dataset.card}"]`);
      if(pills) pills.scrollBy({left:Number(button.dataset.dir)*140,behavior:"smooth"});
    });
    document.querySelectorAll('[data-affiliate="1"]').forEach(link=>link.onclick=()=>{global.dataLayer=global.dataLayer||[];global.dataLayer.push({event:"affiliate_click",product_name:link.dataset.product,product_category:link.dataset.category,lab_result:"tracked_vendor",button_text:"View deal",button_location:"comparison_card",affiliate_network:"direct_vendor",vendor_name:link.dataset.vendor,discount_code:link.dataset.code,affiliate_url:link.href});});
    document.querySelectorAll('[data-variant-shell]').forEach(shell=>{
      const pills=shell.querySelector('[data-variant-pills]');
      if(!pills) return;
      const update=()=>{
        const overflow=pills.scrollWidth>pills.clientWidth+2;
        shell.classList.toggle("has-overflow",overflow);
      };
      update();
      pills.addEventListener("scroll",update,{passive:true});
      if(global.ResizeObserver) new ResizeObserver(update).observe(pills);
    });
  }

  function renderCards(scroll){
    const filtered=cards();
    const status=$("catalogStatus");
    const source=$("catalogSource");
    const grid=$("catalogGrid");
    if(status) status.textContent=state.vendor==="All"?`Showing ${filtered.length} of ${state.cards.length} product cards`:`Showing ${filtered.length} products from ${state.vendor}`;
    if(source) source.textContent=state.source;
    if(grid) grid.innerHTML=filtered.length?filtered.map(cardHtml).join(""):`<div class="catalog-empty">No product cards match these filters.</div>`;
    bindCardActions();
    if(scroll&&grid) grid.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function applyInitialFilters(){
    const params=new URLSearchParams(location.search);
    state.category=params.get("cat")||params.get("category")||document.body.dataset.defaultCategory||"All";
    state.format=params.get("format")||"All";
    state.vendor=params.get("vendor")||"All";
    state.query=params.get("q")||"";
    state.sort=params.get("sort")||"price";
    const search=$("catalogSearch");
    const sort=$("catalogSort");
    if(search) search.value=state.query;
    if(sort) sort.value=state.sort;
  }

  function applyCatalog(payload,source){
    const catalog=payload?.data?.products?payload.data:payload;
    if(!catalog?.products?.length) return;
    state.catalog=catalog;
    state.cards=catalog.products;
    state.source=source;
    updateStats();
    renderFilters();
    renderCards(false);
  }

  function clear(){
    state.query="";
    state.category=document.body.dataset.defaultCategory||"All";
    state.format="All";
    state.vendor="All";
    state.sort="price";
    const search=$("catalogSearch");
    const sort=$("catalogSort");
    if(search) search.value="";
    if(sort) sort.value="price";
    renderFilters();
    renderCards(true);
  }

  async function boot(){
    try{await global.MPPPromotions?.ready;}catch(error){console.warn("Promotion badges unavailable",error.message);}
    const fallbackPromise=json("/data/catalog-fallback-snapshot.json?v=premium-index9",7000);
    const latestPromise=json("/.netlify/functions/catalog-snapshot?v=premium-index9",10000);
    applyInitialFilters();
    try{const fallback=await fallbackPromise;applyCatalog(fallback.data,"Bundled catalog ready");}catch(error){console.warn("Bundled catalog unavailable",error.message);}
    try{const latest=await latestPromise;applyCatalog(latest.data,latest.response.headers.get("X-MPP-Catalog-Source")==="blob"?"Live snapshot loaded":"Bundled snapshot loaded");}catch(error){console.warn("Latest catalog snapshot unavailable",error.message);if(!state.cards.length){const status=$("catalogStatus");const grid=$("catalogGrid");if(status)status.textContent="Catalog unavailable";if(grid)grid.innerHTML=`<div class="catalog-empty">The comparison catalog could not load. Please refresh the page.</div>`;}}
    const search=$("catalogSearch");
    const clearButton=$("catalogClear");
    const sort=$("catalogSort");
    if(search) search.oninput=event=>{state.query=event.target.value;renderCards(false);};
    if(clearButton) clearButton.onclick=clear;
    if(sort) sort.onchange=event=>{state.sort=event.target.value;renderCards(false);};
    global.addEventListener("resize",updateChipsOverflow);
  }

  global.CatalogUI={boot,state};
})(window);
