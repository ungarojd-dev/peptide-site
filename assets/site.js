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
})();
