import { createWooCommerceHandler } from "./_shared/woocommerce-feed.mjs";

const SITE = "https://ionpeptide.com";
const FALLBACK = `${SITE}?ref=SammyC`;

function productUrl(product) {
  try {
    const url = new URL(product.permalink || FALLBACK);
    url.searchParams.set("ref", "SammyC");
    return url.toString();
  } catch {
    return FALLBACK;
  }
}

export const handler = createWooCommerceHandler({
  vendor: "Ion Peptide",
  ckEnv: "ION_CK",
  csEnv: "ION_CS",
  base: `${SITE}/wp-json/wc/v3`,
  productUrl
});
