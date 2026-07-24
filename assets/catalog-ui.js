(function(global){
  "use strict";

  const CATEGORY_ORDER=["All","Peptides","GLP-1 & Incretin","Repair & Recovery","Growth Hormone Research","Cognitive & Nootropic","Longevity & Cellular Health","Metabolic & Mitochondrial","Bioregulators","Skin, Tanning & Sexual Health","Supplies","Other"];
  // Short display labels so the filter chips/dropdown stay tidy. The value stays
  // the full category name (used for filtering and data); only the label shortens.
  const CATEGORY_LABELS={
    "All":"All",
    "GLP-1 & Incretin":"GLP-1",
    "Repair & Recovery":"Recovery",
    "Growth Hormone Research":"Growth Hormone",
    "Cognitive & Nootropic":"Cognitive",
    "Longevity & Cellular Health":"Longevity",
    "Metabolic & Mitochondrial":"Metabolic",
    "Bioregulators":"Bioregulators",
    "Skin, Tanning & Sexual Health":"Skin & Sexual",
    "Supplies":"Supplies",
    "Other":"Other"
  };
  function catLabel(value){return CATEGORY_LABELS[value]||value;}
  const TRACKED_VENDOR_COUNT=14;
  const NON_PEPTIDE_CATEGORIES=["Supplies","Other"];
  const FORMAT_ORDER=["All","Vials","Capsules","Dissolvable Strips","Nasal Sprays","Topicals","Liquids","Aminos","Bioregulators","Supplies"];
  const ALL_VARIANTS="__all__";
  const ALL_FORMATS="__allformats__";
  // Cards carry every format for a compound now, so a single card can hold 14
  // vendors where it used to hold 5. Three visible rows hid too much of that,
  // and it also cut the amount of catalog text rendered for crawlers.
  const DEFAULT_VISIBLE_ROWS=5;
  const state={catalog:null,cards:[],query:"",category:"All",format:"All",vendor:"All",sort:"price",activeVariants:{},activeFormats:{},expanded:{},source:"Loading"};
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
  function filterValues(order,property,allowExtras){
    const found=new Set();
    state.cards.forEach(card=>{
      const value=property==="format"?cardFormatLabels(card):[card[property]];
      value.filter(Boolean).forEach(item=>found.add(item));
    });
    const ordered=order.filter(item=>item==="All"||item==="Peptides"||Array.from(found).some(value=>matchesFilterValue(value,item)));
    if(allowExtras===false) return ordered;
    const extras=Array.from(found).filter(value=>!ordered.some(item=>matchesFilterValue(item,value))).sort((a,b)=>String(a).localeCompare(String(b)));
    return [...ordered,...extras];
  }
  function chip(label,active,display){return `<button type="button" class="catalog-chip${active?" active":""}" data-chip="${attr(label)}">${esc(display||label)}</button>`;}
  function option(label,active,display){return `<option value="${attr(label)}"${active?" selected":""}>${esc(display||label)}</option>`;}
  function setSelectOptions(select,values,selected,labeler){
    if(!select) return;
    select.innerHTML=values.map(label=>option(label,matchesFilterValue(label,selected),labeler?labeler(label):null)).join("");
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
  // Small line icons for physical product type. Category still drives card
  // colour; these make type scannable without spending the colour channel on
  // a field that is 76% "Vials".
  function formatIconKey(label){
    const v=String(label||"").toLowerCase();
    if(v.includes("nasal")||v.includes("spray")) return "spray";
    if(v.includes("capsule")||v.includes("tablet")) return "capsule";
    if(v.includes("liquid")||v.includes("solution")||v.includes("dropper")) return "liquid";
    if(v.includes("topical")||v.includes("cream")||v.includes("gel")) return "topical";
    if(v.includes("supply")||v.includes("supplies")||v.includes("syringe")) return "supplies";
    if(v.includes("vial")||v.includes("lyophil")) return "vial";
    return "";
  }
  function formatIcon(label){
    const key=formatIconKey(label);
    if(!key) return "";
    const paths={
      vial:'<path d="M6 2h6M7.5 2v7.6a2.5 2.5 0 0 0 .4 1.4l.9 1.3a2 2 0 0 1 .3 1.1V16h0M10.5 2v7.6a2.5 2.5 0 0 1-.4 1.4l-.9 1.3a2 2 0 0 0-.3 1.1V16"/><rect x="6.4" y="13.2" width="5.2" height="3.4" rx="1.1"/>',
      capsule:'<rect x="2.6" y="6.4" width="12.8" height="5.2" rx="2.6" transform="rotate(-32 9 9)"/><path d="M7.1 5.2 10.9 12.8"/>',
      spray:'<path d="M7 6h4v9.4a1.2 1.2 0 0 1-1.2 1.2H8.2A1.2 1.2 0 0 1 7 15.4Z"/><path d="M7.6 6V3.4h2.8V6"/><path d="M11.4 3.2h2.2M11.4 5h2.6M11.4 1.5h1.8"/>',
      liquid:'<path d="M9 2.2c2.4 3 3.9 5 3.9 7.1A3.9 3.9 0 0 1 9 13.2a3.9 3.9 0 0 1-3.9-3.9C5.1 7.2 6.6 5.2 9 2.2Z"/>',
      topical:'<rect x="5.4" y="6.6" width="7.2" height="9.6" rx="1.6"/><path d="M7.6 6.6V4.2a1.4 1.4 0 0 1 1.4-1.4h0a1.4 1.4 0 0 1 1.4 1.4v2.4"/><path d="M7.2 9.6h3.6"/>',
      supplies:'<path d="M3.4 12.2 9.6 6l2.4 2.4-6.2 6.2H3.4Z"/><path d="M11 4.6 13.4 7"/><path d="M12.2 3.4 14.6 5.8"/>'
    };
    return `<svg class="fmt-icon" viewBox="0 0 18 18" width="12" height="12" aria-hidden="true" focusable="false">${paths[key]}</svg>`;
  }
  function moleculeIcon(){
    return `<span class="product-molecule" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></span>`;
  }

  // A card now carries every format for a compound (vials, capsules, nasal
  // sprays and so on) instead of one card per format. These helpers read the
  // format list and scope a card's listings to whichever format is selected.
  function cardFormats(card){
    if(Array.isArray(card.formats)&&card.formats.length) return card.formats;
    return card.format?[{id:normalizeFilterValue(card.format).replace(/[^a-z0-9]+/g,"-"),label:card.format,supplier_count:card.supplier_count||0,offer_count:card.offer_count||0}]:[];
  }
  function cardFormatLabels(card){return cardFormats(card).map(item=>item.label);}
  function cardHasFormat(card,value){return value==="All"||cardFormatLabels(card).some(label=>matchesFilterValue(label,value));}
  function selectedFormatId(card){
    const formats=cardFormats(card);
    const chosen=state.activeFormats[card.id];
    if(chosen&&(chosen===ALL_FORMATS||formats.some(item=>item.id===chosen))) return chosen;
    if(state.format!=="All"){
      const match=formats.find(item=>matchesFilterValue(item.label,state.format));
      if(match) return match.id;
    }
    return ALL_FORMATS;
  }
  function cardVariants(card){
    const formatId=selectedFormatId(card);
    const variants=card.variants||[];
    if(formatId===ALL_FORMATS) return variants;
    const scoped=variants.filter(variant=>(variant.format_id||"")===formatId);
    return scoped.length?scoped:variants;
  }
  function allOffers(card,scoped){
    const variants=scoped===false?(card.variants||[]):cardVariants(card);
    return variants.flatMap(variant=>(variant.suppliers||[]).map(supplier=>({variant,supplier}))).sort((a,b)=>{
      const pa=a.supplier.effective_price_min==null?Number.POSITIVE_INFINITY:a.supplier.effective_price_min;
      const pb=b.supplier.effective_price_min==null?Number.POSITIVE_INFINITY:b.supplier.effective_price_min;
      return pa-pb||String(a.variant.label||"").localeCompare(String(b.variant.label||""))||String(a.supplier.vendor_name||"").localeCompare(String(b.supplier.vendor_name||""));
    });
  }
  function bestOffer(card){const offers=offersForCard(card);return offers.find(o=>o.supplier.effective_price_min!=null)||offers[0]||null;}
  function bestOfferAnyFormat(card){const offers=allOffers(card,false).filter(offerMatchesVendor);return offers.find(o=>o.supplier.effective_price_min!=null)||offers[0]||null;}
  // Lowest cost-per-mg across every offer on the card. This is the number a
  // buyer actually optimizes for, so we surface it as the "Best value" hero row.
  function bestValueOffer(card){
    const priced=allOffers(card).filter(o=>typeof o.supplier.price_per_mg==="number"&&o.supplier.price_per_mg>0&&o.supplier.in_stock!==false);
    if(!priced.length) return null;
    return priced.reduce((best,o)=>o.supplier.price_per_mg<best.supplier.price_per_mg?o:best);
  }
  function selectedVariantId(card){
    const chosen=state.activeVariants[card.id];
    if(!chosen||chosen===ALL_VARIANTS) return ALL_VARIANTS;
    return cardVariants(card).some(variant=>variant.id===chosen)?chosen:ALL_VARIANTS;
  }
  function activeVariant(card){const selected=selectedVariantId(card);const list=cardVariants(card);return list.find(variant=>variant.id===selected)||list[0]||{id:"",label:"Standard listing",suppliers:[]};}
  function searchText(card){return [card.name,card.category,cardFormatLabels(card).join(" "),...(card.variants||[]).flatMap(variant=>(variant.suppliers||[]).flatMap(supplier=>[supplier.vendor_name,supplier.raw_product,supplier.raw_listing,supplier.sku]))].join(" ").toLowerCase();}
  function cardVendors(card){return new Set((card.variants||[]).flatMap(variant=>(variant.suppliers||[]).map(supplier=>String(supplier.vendor_name||"").trim())).filter(Boolean));}
  function cardHasVendor(card,vendor){return vendor==="All"||Array.from(cardVendors(card)).some(name=>matchesFilterValue(name,vendor));}
  function offerMatchesVendor(offer){return state.vendor==="All"||matchesFilterValue(offer?.supplier?.vendor_name,state.vendor);}
  function offersForCard(card){return allOffers(card).filter(offerMatchesVendor);}
  function allVendorNames(){const set=new Map();state.cards.forEach(card=>cardVendors(card).forEach(name=>set.set(normalizeFilterValue(name),name)));return Array.from(set.values()).sort((a,b)=>a.localeCompare(b));}

  function categoryMatches(card){
    if(state.category==="All") return true;
    if(state.category==="Peptides") return !NON_PEPTIDE_CATEGORIES.some(excluded=>matchesFilterValue(card.category,excluded));
    return matchesFilterValue(card.category,state.category);
  }
  function bestPerMg(card){
    let best=Number.POSITIVE_INFINITY;
    allOffers(card,false).forEach(offer=>{
      const value=offer?.supplier?.price_per_mg;
      if(Number.isFinite(value)&&value>0&&value<best) best=value;
    });
    return best;
  }

  function cards(){
    const query=state.query.trim().toLowerCase();
    const filtered=state.cards.filter(card=>categoryMatches(card)&&cardHasFormat(card,state.format)&&cardHasVendor(card,state.vendor)&&(!query||searchText(card).includes(query)));
    return filtered.sort((a,b)=>{
      if(state.sort==="vendors") return Number(b.supplier_count||0)-Number(a.supplier_count||0)||String(a.name||"").localeCompare(String(b.name||""));
      if(state.sort==="name") return String(a.name||"").localeCompare(String(b.name||""));
      if(state.sort==="permg"){
        const ma=bestPerMg(a), mb=bestPerMg(b);
        return ma-mb||String(a.name||"").localeCompare(String(b.name||""));
      }
      const pa=bestOfferAnyFormat(a)?.supplier?.effective_price_min??Number.POSITIVE_INFINITY;
      const pb=bestOfferAnyFormat(b)?.supplier?.effective_price_min??Number.POSITIVE_INFINITY;
      return pa-pb||String(a.name||"").localeCompare(String(b.name||""));
    });
  }

  function renderFilters(){
    const categoryValues=filterValues(CATEGORY_ORDER,"category",false);
    const formatValues=filterValues(FORMAT_ORDER,"format",false);
    const vendorValues=["All",...allVendorNames()];

    const categorySelect=$("catalogCategorySelect");
    const formatSelect=$("catalogFormatSelect");
    const vendorSelect=$("catalogVendorSelect");
    setSelectOptions(categorySelect,categoryValues,state.category,catLabel);
    setSelectOptions(formatSelect,formatValues,state.format);
    setSelectOptions(vendorSelect,vendorValues,state.vendor);

    if(categorySelect) categorySelect.onchange=event=>{state.category=event.target.value;renderFilters();renderCards(true);};
    if(formatSelect) formatSelect.onchange=event=>{state.format=event.target.value;renderFilters();renderCards(true);};
    if(vendorSelect) vendorSelect.onchange=event=>{state.vendor=event.target.value;renderFilters();renderCards(true);};

    const categories=$("catalogCategories");
    const formats=$("catalogFormats");
    const vendors=$("catalogVendors");
    if(categories) categories.innerHTML=categoryValues.map(label=>chip(label,matchesFilterValue(label,state.category),catLabel(label))).join("");
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
    // The static fallback snapshot only carries a subset of vendors, so
    // vendors_loaded can read low (e.g. 5) on first paint and for crawlers.
    // We track 14 vendors, so never display fewer than that.
    set("statVendors",Math.max(Number(catalog.vendors_loaded)||0,TRACKED_VENDOR_COUNT));
  }

  const PAYMENT_GLYPHS={
    visa:"card",mastercard:"card",amex:"card","american-express":"card",discover:"card",
    "credit-card":"card",card:"card","debit-card":"card","credit-debit":"card",
    zelle:"bank",ach:"bank","bank-transfer":"bank",wire:"bank","wire-transfer":"bank",
    check:"check","e-check":"check",echeck:"check",
    bitcoin:"crypto",btc:"crypto",ethereum:"crypto",eth:"crypto",crypto:"crypto",
    usdt:"crypto",usdc:"crypto",litecoin:"crypto","coinbase-commerce":"crypto",
    cashapp:"mobile-pay","cash-app":"mobile-pay",venmo:"mobile-pay",
    "apple-pay":"mobile-pay","google-pay":"mobile-pay",
    paypal:"wallet",wise:"wallet",affirm:"wallet",
    chime:"bank",bank:"bank","bank-payment":"bank"
  };
  const paymentSlug=value=>String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  const paymentGlyph=slug=>PAYMENT_GLYPHS[slug]||"card";

  function supplierRow(supplier,card,variantLabel="",isBest=false){
    const logo=supplier.vendor_logo?`<img class="supplier-logo" src="${attr(supplier.vendor_logo)}" alt="${attr(supplier.vendor_name)} logo" loading="lazy" width="34" height="34"/>`:`<span class="supplier-initials">${esc(initials(supplier.vendor_name))}</span>`;
    const regular=supplier.discount_percent>0&&supplier.regular_price_label!==supplier.effective_price_label?`<div class="supplier-regular">${esc(supplier.regular_price_label)}</div>`:"";
    const stock=supplier.in_stock===false?`<span class="supplier-oos">Out of stock</span>`:"";
    const alternate=supplier.alternate_offer_count?`<span>${esc(Number(supplier.alternate_offer_count)+1)} listings</span>`:"";
    const listingName=supplier.raw_listing||supplier.raw_product||"";
    const productListing="";
    const variantLine=variantLabel&&variantLabel!=="Standard listing"?`<span class="supplier-variant-line"><span>Size</span> ${esc(variantLabel)}</span>`:"";
    const bestBadge=isBest?`<span class="supplier-best">Lowest</span>`:"";
    // Label reads both raw percentages straight from promotions.json, which is
    // loaded client side. Deliberately not derived from the snapshot: a stale
    // snapshot used to make this fall back to a compounded figure like 40.5%,
    // which is not a number any vendor advertises.
    const activePromos=global.MPPPromotions?.forOfferAll?.(supplier,card)||[];
    const badgePromos=global.MPPPromotions?.forOffer?.(supplier,card)||[];
    const salePromo=activePromos.find(p=>Number.isFinite(Number(p.sale_percent))&&Number.isFinite(Number(p.code_percent)));
    const code=esc(supplier.coupon_code||"SAMMYC");
    let discount;
    if(salePromo){
      discount=`<span class="supplier-discount">${esc(Number(salePromo.sale_percent))}% off <span class="supplier-discount-plus">+ ${esc(Number(salePromo.code_percent))}% with ${code}</span></span>`;
    }else if(supplier.discount_percent){
      discount=`<span class="supplier-discount">${esc(Number(supplier.discount_percent))}% off with ${code}</span>`;
    }else{
      discount=`<span class="supplier-discount">Code details on vendor site</span>`;
    }
    const promotions=badgePromos;
    // A flat sale already shows as a struck-through price, so a badge would
    // repeat it. Only conditional deals, which leave the unit price unchanged,
    // still need a marker.
    const conditional=promotions.filter(promotion=>promotion.conditional_deal===true&&promotion.chip_label);
    // Vendor-level standing offer that never expires and applies only to a
    // subset of buyers (e.g. first-order code). Never in the pricing math,
    // shown as a conditional marker like a promo would be.
    const firstOrder=supplier.vendor_first_order_offer&&supplier.vendor_first_order_offer.chip_label?supplier.vendor_first_order_offer:null;
    const chips=[];
    if(conditional.length)chips.push(conditional[0].chip_label);
    if(firstOrder)chips.push(firstOrder.chip_label);
    const promoBadges=chips.length?`<div class="supplier-promos">${chips.slice(0,2).map(label=>`<span class="supplier-promo-badge">${esc(label)}</span>`).join("")}</div>`:"";
    // First-order detail now lives in the announcements strip, so the row
    // carries only the chip to stay uncluttered.
    const firstOrderLine="";
    return `<a class="supplier-row${isBest?" is-best":""}" href="${attr(supplier.affiliate_url||"#")}" target="_blank" rel="nofollow sponsored noopener" data-affiliate="1" data-product="${attr(card.name)}" data-category="${attr(card.category)}" data-vendor="${attr(supplier.vendor_name)}" data-code="${attr(supplier.coupon_code||"")}"><div class="supplier-left">${logo}<div class="supplier-copy"><div class="supplier-name-row"><div class="supplier-name">${esc(supplier.vendor_name)}</div>${bestBadge}</div><div class="supplier-meta-line">${variantLine}${stock}${alternate}</div>${productListing}<div class="supplier-sub">${discount}</div>${promoBadges}${firstOrderLine}</div></div><div class="supplier-price-wrap">${regular}<div class="supplier-price">${esc(supplier.effective_price_label||"Contact vendor")}</div>${supplier.price_per_mg_label?`<div class="supplier-permg">${esc(supplier.price_per_mg_label)}</div>`:""}<div class="supplier-go">View deal</div></div></a>`;
  }

  function cardHtml(card){
    const selected=selectedVariantId(card);
    const isAll=selected===ALL_VARIANTS;
    const variant=activeVariant(card);
    const formats=cardFormats(card);
    const formatId=selectedFormatId(card);
    const multiFormat=formats.length>1;
    const scopedVariants=cardVariants(card);
    const expanded=!!state.expanded[card.id];
    const rows=(isAll?allOffers(card):(variant.suppliers||[]).map(supplier=>({supplier,variant})).sort((a,b)=>(a.supplier.effective_price_min??Number.POSITIVE_INFINITY)-(b.supplier.effective_price_min??Number.POSITIVE_INFINITY))).filter(offerMatchesVendor);
    const visible=expanded?rows:rows.slice(0,DEFAULT_VISIBLE_ROWS);
    const hidden=Math.max(0,rows.length-visible.length);
    const best=bestOffer(card);
    const bestValue=bestValueOffer(card);
    const lowestPrice=best?money(best.supplier.effective_price_min):null;
    const lowestVendor=best?best.supplier.vendor_name:"";
    const tone=categoryClass(card.category);
    const totalListings=rows.length;
    const shownVendorCount=new Set(rows.map(row=>String(row.supplier.vendor_name||"").trim()).filter(Boolean)).size;
    const vendorLabel=state.vendor==="All"?`${esc(shownVendorCount)} vendor${shownVendorCount===1?"":"s"}`:`${esc(totalListings)} listing${totalListings===1?"":"s"}`;
    const formatSummary=formatId===ALL_FORMATS?(multiFormat?`${formats.length} formats`:(formats[0]?.label||"Research product")):(formats.find(item=>item.id===formatId)?.label||card.format||"Research product");
    const lowestLabel=state.vendor==="All"?"Lowest tracked price":`Lowest ${esc(state.vendor)} price`;
    const rowLabel=row=>{
      const size=row.variant?.label||"";
      if(!isAll) return "";
      if(multiFormat&&formatId===ALL_FORMATS) return row.variant?.full_label||[size,row.variant?.format].filter(Boolean).join(" ");
      return size;
    };
    const supplierHtml=visible.length?visible.map((row,index)=>supplierRow(row.supplier,card,rowLabel(row),index===0&&row.supplier.effective_price_min!=null)).join(""):`<div class="supplier-row supplier-empty-row"><span>No listings available for this vendor.</span></div>`;

    return `<article class="product-card ${tone}${expanded?" is-expanded":""}" data-card-id="${attr(card.id)}">
      <header class="product-card-head">
        <div class="product-title-row">
          <div class="product-title-copy">
            <h2 class="product-title">${esc(card.name)}</h2>
            <div class="product-subtitle"><span class="fmt-summary">${multiFormat&&formatId===ALL_FORMATS?"":formatIcon(formatSummary)}${esc(formatSummary)}</span><span class="product-cat-inline">${esc(catLabel(card.category)||"Product")}</span><span class="vendor-count">${vendorLabel}</span></div>
          </div>
        </div>
      </header>
      ${multiFormat?`<div class="variant-wrap format-wrap">
        <span class="variant-label">Format</span>
        <div class="variant-pills-shell" data-variant-shell="fmt-${attr(card.id)}">
          <button type="button" class="variant-scroll-btn" data-action="variant-scroll" data-dir="-1" data-card="fmt-${attr(card.id)}" aria-label="Scroll formats left">&lsaquo;</button>
          <div class="variant-pills" data-variant-pills="fmt-${attr(card.id)}">
            <button type="button" class="variant-button all${formatId===ALL_FORMATS?" active":""}" data-action="format" data-card="${attr(card.id)}" data-format="${ALL_FORMATS}">All formats (${esc(card.offer_count||0)})</button>
            ${formats.map(item=>`<button type="button" class="variant-button${formatId===item.id?" active":""}" data-action="format" data-card="${attr(card.id)}" data-format="${attr(item.id)}">${formatIcon(item.label)}${esc(item.label)} (${esc(item.offer_count)})</button>`).join("")}
          </div>
          <button type="button" class="variant-scroll-btn" data-action="variant-scroll" data-dir="1" data-card="fmt-${attr(card.id)}" aria-label="Scroll formats right">&rsaquo;</button>
        </div>
      </div>`:""}
      <div class="variant-wrap">
        <span class="variant-label">Compare size or listing</span>
        <div class="variant-pills-shell" data-variant-shell="${attr(card.id)}">
          <button type="button" class="variant-scroll-btn" data-action="variant-scroll" data-dir="-1" data-card="${attr(card.id)}" aria-label="Scroll sizes left">‹</button>
          <div class="variant-pills" data-variant-pills="${attr(card.id)}">
            <button type="button" class="variant-button all${isAll?" active":""}" data-action="variant" data-card="${attr(card.id)}" data-variant="${ALL_VARIANTS}">All listings${totalListings?` (${esc(totalListings)})`:""}</button>
            ${scopedVariants.map(item=>`<button type="button" class="variant-button${!isAll&&item.id===variant.id?" active":""}" data-action="variant" data-card="${attr(card.id)}" data-variant="${attr(item.id)}">${esc(multiFormat&&formatId===ALL_FORMATS?(item.full_label||item.label):item.label)}${item.all_offer_count?` (${esc(item.all_offer_count)})`:""}</button>`).join("")}
          </div>
          <button type="button" class="variant-scroll-btn" data-action="variant-scroll" data-dir="1" data-card="${attr(card.id)}" aria-label="Scroll sizes right">›</button>
        </div>
      </div>
      ${bestValue?`<a class="best-value-row" href="${attr(bestValue.supplier.affiliate_url||"#")}" target="_blank" rel="nofollow sponsored noopener" data-affiliate="1" data-product="${attr(card.name)}" data-category="${attr(card.category)}" data-vendor="${attr(bestValue.supplier.vendor_name)}" data-code="${attr(bestValue.supplier.coupon_code||"")}">
        <span class="bv-mark" aria-hidden="true">&#9733;</span>
        <span class="bv-body">
          <span class="bv-label">Best value per mg</span>
          <span class="bv-detail">${esc(bestValue.supplier.vendor_name)}${bestValue.variant&&bestValue.variant.label&&bestValue.variant.label!=="Standard listing"?` &middot; ${esc(bestValue.variant.label)}`:""}${multiFormat&&formatId===ALL_FORMATS&&bestValue.variant?.format?` &middot; ${esc(bestValue.variant.format)}`:""}</span>
        </span>
        <span class="bv-figure">
          <span class="bv-permg">${esc(bestValue.supplier.price_per_mg_label)}</span>
          <span class="bv-go">View &#8250;</span>
        </span>
      </a>`:""}
      <div class="supplier-head"><span>Estimated after-code prices</span><span>Low to high</span></div>
      <div class="suppliers">${supplierHtml}</div>
      ${hidden?`<button type="button" class="expand-button" data-action="expand" data-card="${attr(card.id)}">${expanded?"Show fewer listings":`Show ${hidden} more listing${hidden===1?"":"s"}`}</button>`:""}
    </article>`;
  }

  function bindCardActions(){
    document.querySelectorAll('[data-action="clear-filters"]').forEach(button=>button.onclick=clear);
    document.querySelectorAll('[data-action="format"]').forEach(button=>button.onclick=()=>{state.activeFormats[button.dataset.card]=button.dataset.format;delete state.activeVariants[button.dataset.card];renderCards(false);});
    document.querySelectorAll('[data-action="variant"]').forEach(button=>button.onclick=()=>{state.activeVariants[button.dataset.card]=button.dataset.variant;state.expanded[button.dataset.card]=true;renderCards(false);});
    document.querySelectorAll('[data-action="expand"]').forEach(button=>button.onclick=()=>{
      const cardId=button.dataset.card;
      const wasExpanding=!state.expanded[cardId];
      state.expanded[cardId]=wasExpanding;
      renderCards(false);
      if(wasExpanding){
        const cardEl=document.querySelector(`[data-card-id="${CSS.escape(cardId)}"]`);
        if(cardEl){
          const stickyHeader=document.querySelector(".site-top");
          const stickyControls=document.querySelector(".premium-catalog .catalog-controls");
          const isStickyControls=stickyControls&&getComputedStyle(stickyControls).position==="sticky";
          const headerOffset=(stickyHeader?stickyHeader.getBoundingClientRect().height:0)+(isStickyControls?stickyControls.getBoundingClientRect().height:0)+16;
          const top=cardEl.getBoundingClientRect().top+window.pageYOffset-headerOffset;
          window.scrollTo({top:Math.max(0,top),behavior:"smooth"});
        }
      }
    });
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
    if(grid) grid.innerHTML=filtered.length?filtered.map(cardHtml).join(""):`<div class="catalog-empty"><strong>No matches found.</strong><br>Try a different search term or <button type="button" class="catalog-empty-clear" data-action="clear-filters">clear all filters</button>.</div>`;
    bindCardActions();
    if(scroll&&grid) grid.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function applyInitialFilters(){
    const params=new URLSearchParams(location.search);
    state.category=params.get("cat")||params.get("category")||document.body.dataset.defaultCategory||"All";
    state.format=params.get("format")||"All";
    state.vendor=params.get("vendor")||"All";
    state.query=params.get("q")||"";
    state.sort=params.get("sort")||"name";
    const search=$("catalogSearch");
    const sort=$("catalogSort");
    if(search) search.value=state.query;
    if(sort) sort.value=state.sort;
  }

  // A snapshot built by an older engine splits a compound into one card per
  // format. The live Netlify Blobs snapshot can lag a deploy by a refresh cycle,
  // and it overwrites the bundled catalog on load, which would resurrect the
  // duplicate cards. Merging here means the grid is correct no matter which
  // engine produced the payload.
  function mergeLegacyCards(products){
    const groups=new Map();
    products.forEach(card=>{
      const key=card.product_id||normalizeFilterValue(card.name);
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(card);
    });
    if(groups.size===products.length) return products;
    const merged=[];
    groups.forEach((group,key)=>{
      if(group.length===1&&Array.isArray(group[0].formats)&&group[0].formats.length){merged.push(group[0]);return;}
      const variants=[];
      const formats=new Map();
      const vendors=new Set();
      let offerCount=0;
      group.forEach(card=>{
        const label=card.format||"Vials";
        const formatId=normalizeFilterValue(label).replace(/[^a-z0-9]+/g,"-")||"other";
        if(!formats.has(formatId)) formats.set(formatId,{id:formatId,label,offer_count:0,vendorNames:new Set()});
        const entry=formats.get(formatId);
        (card.variants||[]).forEach(variant=>{
          const suppliers=variant.suppliers||[];
          suppliers.forEach(supplier=>{vendors.add(supplier.vendor_name);entry.vendorNames.add(supplier.vendor_name);});
          entry.offer_count+=variant.all_offer_count||suppliers.length;
          offerCount+=variant.all_offer_count||suppliers.length;
          variants.push({...variant,id:`${formatId}::${variant.id}`,quantity_id:variant.id,format:label,format_id:formatId,full_label:`${variant.label} ${label}`});
        });
      });
      const formatList=[...formats.values()].map(entry=>({id:entry.id,label:entry.label,offer_count:entry.offer_count,supplier_count:entry.vendorNames.size}))
        .sort((a,b)=>b.supplier_count-a.supplier_count||b.offer_count-a.offer_count||String(a.label).localeCompare(String(b.label)));
      const priced=variants.flatMap(variant=>variant.suppliers||[]).map(supplier=>supplier.effective_price_min).filter(value=>value!=null);
      const base=group[0];
      merged.push({...base,
        id:key,
        product_id:base.product_id||key,
        format:formatList.length?formatList[0].label:base.format,
        formats:formatList,
        format_labels:formatList.map(entry=>entry.label),
        supplier_count:vendors.size,
        offer_count:offerCount,
        lowest_effective_price:priced.length?Math.min(...priced):null,
        variants:variants.sort((a,b)=>(b.supplier_count||0)-(a.supplier_count||0)||(a.sort||0)-(b.sort||0)||String(a.label).localeCompare(String(b.label)))
      });
    });
    return merged.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
  }

  function applyCatalog(payload,source){
    const catalog=payload?.data?.products?payload.data:payload;
    if(!catalog?.products?.length) return;
    const products=mergeLegacyCards(catalog.products);
    state.catalog={...catalog,product_card_count:products.length};
    state.cards=products;
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
    state.sort="name";
    const search=$("catalogSearch");
    const sort=$("catalogSort");
    if(search) search.value="";
    if(sort) sort.value="price";
    renderFilters();
    renderCards(true);
  }

  async function boot(){
    try{await global.MPPPromotions?.ready;}catch(error){console.warn("Promotion badges unavailable",error.message);}
    const fallbackPromise=json("/data/catalog-fallback-snapshot.json?v=20260724-scoped-glp-v1",7000);
    const latestPromise=json("/.netlify/functions/catalog-snapshot?v=20260724-scoped-glp-v1",10000);
    applyInitialFilters();
    try{const fallback=await fallbackPromise;applyCatalog(fallback.data,"Bundled catalog ready");}catch(error){console.warn("Bundled catalog unavailable",error.message);}
    try{const latest=await latestPromise;applyCatalog(latest.data,latest.response.headers.get("X-MPP-Catalog-Source")==="blob"?"Live snapshot loaded":"Bundled snapshot loaded");}catch(error){console.warn("Latest catalog snapshot unavailable",error.message);if(!state.cards.length){const status=$("catalogStatus");const grid=$("catalogGrid");if(status)status.textContent="Catalog unavailable";if(grid)grid.innerHTML=`<div class="catalog-empty">The comparison catalog could not load. Please refresh the page.</div>`;}}
    const search=$("catalogSearch");
    const clearButton=$("catalogClear");
    const sort=$("catalogSort");
    if(search) search.oninput=event=>{state.query=event.target.value;renderCards(false);};
    if(clearButton) clearButton.onclick=clear;
    if(sort) sort.onchange=event=>{state.sort=event.target.value;renderCards(false);};
    // Hero "Jump to" chips: fill the catalog search and scroll to the compare grid.
    document.querySelectorAll("[data-chip-query]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const q=btn.getAttribute("data-chip-query")||"";
        state.query=q;
        const s=$("catalogSearch");
        if(s) s.value=q;
        renderCards(false);
        const target=document.getElementById("compare")||s;
        if(target) target.scrollIntoView({behavior:"smooth",block:"start"});
      });
    });
    global.addEventListener("resize",updateChipsOverflow);
  }

  global.CatalogUI={boot,state};
})(window);

// Payment icon fallback: if an official brand SVG is not present in /assets/payment-icons/,
// swap to the generic glyph. If that is missing too, drop the image and keep the text label.
(function paymentIconFallback(){
  document.addEventListener("error",event=>{
    const img=event.target;
    if(!img||!img.classList||!img.classList.contains("payment-icon-img")) return;
    const fallback=img.getAttribute("data-fallback");
    if(fallback&&img.getAttribute("src")!==fallback){ img.setAttribute("src",fallback); return; }
    img.remove();
  },true);
})();
