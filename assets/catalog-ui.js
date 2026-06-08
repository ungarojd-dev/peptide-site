(function(global){
  "use strict";
  const CATEGORY_ORDER=["All","GLP-1 & Incretin","Repair & Recovery","Growth Hormone Research","Cognitive & Nootropic","Longevity & Cellular Health","Metabolic & Mitochondrial","Bioregulators","Skin, Tanning & Sexual Health","Supplies","Other"];
  const FORMAT_ORDER=["All","Vials","Capsules","Dissolvable Strips","Nasal Sprays","Topicals","Liquids","Aminos","Bioregulators","Supplies"];
  const state={catalog:null,cards:[],query:"",category:"All",format:"All",activeVariants:{},expanded:{},source:"Loading"};
  const $=id=>document.getElementById(id);
  const esc=value=>String(value==null?"":value).replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
  const attr=value=>esc(value).replace(/'/g,"&#39;");
  function json(url,ms=10000){const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),ms);return fetch(url,{signal:ctrl.signal,cache:"no-store"}).then(response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json().then(data=>({data,response}))}).finally(()=>clearTimeout(timer));}
  function initials(name){return String(name||"?").split(/\s+/).map(word=>word[0]).join("").slice(0,2).toUpperCase();}
  function filterValues(order,property){const found=new Set(state.cards.map(card=>card[property]).filter(Boolean));return order.filter(item=>item==="All"||found.has(item));}
  function chip(label,active){return `<button type="button" class="catalog-chip${active?" active":""}" data-chip="${attr(label)}">${esc(label)}</button>`;}
  function renderFilters(){
    $("catalogCategories").innerHTML=filterValues(CATEGORY_ORDER,"category").map(label=>chip(label,state.category===label)).join("");
    $("catalogFormats").innerHTML=filterValues(FORMAT_ORDER,"format").map(label=>chip(label,state.format===label)).join("");
    document.querySelectorAll("#catalogCategories [data-chip]").forEach(button=>button.onclick=()=>{state.category=button.dataset.chip;renderFilters();renderCards(true)});
    document.querySelectorAll("#catalogFormats [data-chip]").forEach(button=>button.onclick=()=>{state.format=button.dataset.chip;renderFilters();renderCards(true)});
  }
  function updateStats(){
    const catalog=state.catalog||{};
    const set=(id,value)=>{const node=$(id);if(node)node.textContent=String(value)};
    set("statCards",catalog.product_card_count||0);set("statOffers",catalog.normalized_offer_count||0);set("statVendors",catalog.vendors_loaded||0);
  }
  function searchText(card){return [card.name,card.category,card.format,...(card.variants||[]).flatMap(variant=>(variant.suppliers||[]).flatMap(supplier=>[supplier.vendor_name,supplier.raw_product,supplier.raw_listing,supplier.sku]))].join(" ").toLowerCase();}
  function cards(){const query=state.query.trim().toLowerCase();return state.cards.filter(card=>(state.category==="All"||card.category===state.category)&&(state.format==="All"||card.format===state.format)&&(!query||searchText(card).includes(query)));}
  function activeVariant(card){const selected=state.activeVariants[card.id];return card.variants.find(variant=>variant.id===selected)||card.variants[0]||{id:"",label:"Standard listing",suppliers:[]};}
  function supplierRow(supplier,card){
    const logo=supplier.vendor_logo?`<img class="supplier-logo" src="${attr(supplier.vendor_logo)}" alt="${attr(supplier.vendor_name)} logo" loading="lazy" width="20" height="20"/>`:`<span class="supplier-initials">${esc(initials(supplier.vendor_name))}</span>`;
    const regular=supplier.discount_percent>0&&supplier.regular_price_label!==supplier.effective_price_label?`<div class="supplier-regular">${esc(supplier.regular_price_label)}</div>`:"";
    const stock=supplier.in_stock===false?`<span class="supplier-oos">Out of stock</span>`:`<span>Listed</span>`;
    const alternate=supplier.alternate_offer_count?`<span>${esc(Number(supplier.alternate_offer_count)+1)} listings</span>`:"";
    const promotions=global.MPPPromotions?.forOffer?.(supplier,card)||[];
    const promoBadges=promotions.length?`<div class="supplier-promos">${promotions.slice(0,2).map(promotion=>`<span class="supplier-promo-badge">${esc(promotion.badge||promotion.headline)}</span>`).join("")}${promotions.length>2?`<span class="supplier-promo-more">+${promotions.length-2} more</span>`:""}</div>`:"";
    return `<a class="supplier-row" href="${attr(supplier.affiliate_url||"#")}" target="_blank" rel="nofollow sponsored noopener" data-affiliate="1" data-product="${attr(card.name)}" data-category="${attr(card.category)}" data-vendor="${attr(supplier.vendor_name)}" data-code="${attr(supplier.coupon_code||"")}"><div class="supplier-left">${logo}<div style="min-width:0"><div class="supplier-name">${esc(supplier.vendor_name)}</div><div class="supplier-sub">${stock}${supplier.discount_percent?`<span class="supplier-discount">${esc(supplier.discount_percent)}% off with ${esc(supplier.coupon_code)}</span>`:""}${alternate}</div>${promoBadges}</div></div><div class="supplier-price-wrap">${regular}<div class="supplier-price">${esc(supplier.effective_price_label||"Contact vendor")}</div><div class="supplier-go">Visit vendor ›</div></div></a>`;
  }
  function cardHtml(card){
    const variant=activeVariant(card);const expanded=!!state.expanded[card.id];const suppliers=variant.suppliers||[];const visible=expanded?suppliers:suppliers.slice(0,3);const hidden=Math.max(0,suppliers.length-3);
    return `<article class="product-card"><header class="product-card-head"><div class="product-card-meta">${esc(card.category)} · ${esc(card.format)}</div><div class="product-title-row"><h2 class="product-title">${esc(card.name)}</h2><span class="vendor-count">${esc(card.supplier_count)} vendor${card.supplier_count===1?"":"s"}</span></div></header><div class="variant-wrap"><span class="variant-label">SELECT SIZE OR LISTING</span><div class="variant-pills">${(card.variants||[]).map(item=>`<button type="button" class="variant-button${item.id===variant.id?" active":""}" data-action="variant" data-card="${attr(card.id)}" data-variant="${attr(item.id)}">${esc(item.label)}</button>`).join("")}</div></div><div class="supplier-head"><span>Use <span class="code-pill">${esc(state.catalog?.coupon_code||"SAMMYC")}</span> for prices below</span><span>Low to high</span></div><div class="suppliers">${visible.length?visible.map(supplier=>supplierRow(supplier,card)).join(""):`<div class="supplier-row"><span>No supplier offers for this listing.</span></div>`}</div>${hidden?`<button type="button" class="expand-button" data-action="expand" data-card="${attr(card.id)}">${expanded?"Show fewer vendors":`Show ${hidden} more vendor${hidden===1?"":"s"}`}</button>`:""}</article>`;
  }
  function bindCardActions(){
    document.querySelectorAll('[data-action="variant"]').forEach(button=>button.onclick=()=>{state.activeVariants[button.dataset.card]=button.dataset.variant;state.expanded[button.dataset.card]=false;renderCards(false)});
    document.querySelectorAll('[data-action="expand"]').forEach(button=>button.onclick=()=>{state.expanded[button.dataset.card]=!state.expanded[button.dataset.card];renderCards(false)});
    document.querySelectorAll('[data-affiliate="1"]').forEach(link=>link.onclick=()=>{global.dataLayer=global.dataLayer||[];global.dataLayer.push({event:"affiliate_click",product_name:link.dataset.product,product_category:link.dataset.category,lab_result:"tracked_vendor",button_text:"Visit vendor",button_location:"comparison_card",affiliate_network:"direct_vendor",vendor_name:link.dataset.vendor,discount_code:link.dataset.code,affiliate_url:link.href})});
  }
  function renderCards(scroll){const filtered=cards();$("catalogStatus").textContent=`Showing ${filtered.length} of ${state.cards.length} product cards`;$("catalogSource").textContent=state.source;$("catalogGrid").innerHTML=filtered.length?filtered.map(cardHtml).join(""):`<div class="catalog-empty">No product cards match these filters.</div>`;bindCardActions();if(scroll)$("catalogGrid").scrollIntoView({behavior:"smooth",block:"start"});}
  function applyInitialFilters(){const params=new URLSearchParams(location.search);state.category=params.get("cat")||params.get("category")||document.body.dataset.defaultCategory||"All";state.format=params.get("format")||"All";state.query=params.get("q")||"";$("catalogSearch").value=state.query;}
  function applyCatalog(catalog,source){if(!catalog?.products?.length)return;state.catalog=catalog;state.cards=catalog.products;state.source=source;updateStats();renderFilters();renderCards(false);}
  function clear(){state.query="";state.category=document.body.dataset.defaultCategory||"All";state.format="All";$("catalogSearch").value="";renderFilters();renderCards(true);}
  async function boot(){
    try{await global.MPPPromotions?.ready}catch(error){console.warn("Promotion badges unavailable",error.message)}
    const fallbackPromise=json("/data/catalog-fallback-snapshot.json?v=promotions-20260608a",7000);
    const latestPromise=json("/.netlify/functions/catalog-snapshot?v=promotions-20260608a",10000);
    try{const fallback=await fallbackPromise;applyInitialFilters();applyCatalog(fallback.data,"Bundled catalog ready");}catch(error){console.warn("Bundled catalog unavailable",error.message)}
    try{const latest=await latestPromise;applyCatalog(latest.data,latest.response.headers.get("X-MPP-Catalog-Source")==="blob"?"Live snapshot loaded":"Bundled snapshot loaded");}catch(error){console.warn("Latest catalog snapshot unavailable",error.message);if(!state.cards.length){$("catalogStatus").textContent="Catalog unavailable";$("catalogGrid").innerHTML=`<div class="catalog-empty">The comparison catalog could not load. Please refresh the page.</div>`}}
    $("catalogSearch").oninput=event=>{state.query=event.target.value;renderCards(false)};$("catalogClear").onclick=clear;
  }
  global.CatalogUI={boot,state};
})(window);
