// Optional enrichment layer for vendors whose stable feeds return parent variable products.
// If enrichment fails, the browser keeps the stable product snapshot.
const FEEDS = [
  { vendor: "Glow Aminos", path: "/.netlify/functions/glow-expanded-products" },
  { vendor: "Flawless Compounds", path: "/.netlify/functions/flawless-expanded-products" }
];
function origin(event){
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers.host || "mypeptideprice.com";
  return `${proto}://${host}`;
}
async function json(url, ms=12000){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),ms);
  try{
    const response=await fetch(url,{signal:ctrl.signal});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}
export const handler=async event=>{
  const headers={
    "Access-Control-Allow-Origin":"https://mypeptideprice.com",
    "Access-Control-Allow-Methods":"GET, OPTIONS",
    "Content-Type":"application/json",
    "Cache-Control":"public, max-age=300, stale-while-revalidate=21600",
    "Netlify-CDN-Cache-Control":"public, durable, max-age=900, stale-while-revalidate=21600"
  };
  if(event.httpMethod==="OPTIONS") return {statusCode:200,headers,body:""};
  const base=origin(event);
  const settled=await Promise.allSettled(FEEDS.map(async feed=>{
    const data=await json(`${base}${feed.path}`);
    return {vendor:feed.vendor,products:Array.isArray(data.products)?data.products:[]};
  }));
  const products=[];
  const vendors=[];
  const errors=[];
  settled.forEach((result,index)=>{
    const feed=FEEDS[index];
    if(result.status==="fulfilled" && result.value.products.length){
      vendors.push(feed.vendor);
      products.push(...result.value.products);
    } else {
      errors.push({vendor:feed.vendor,error:result.status==="rejected"?result.reason.message:"No enrichment rows returned"});
    }
  });
  return {statusCode:200,headers,body:JSON.stringify({fetched_at:new Date().toISOString(),count:products.length,vendors,errors,products})};
};
