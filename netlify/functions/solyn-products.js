import { createWooCommerceHandler } from "./_shared/woocommerce-feed.mjs";

export const handler = createWooCommerceHandler({
  vendor: "Solyn Labs",
  ckEnv: "SOLYN_CK",
  csEnv: "SOLYN_CS",
  base: "https://solyn.com/wp-json/wc/v3",
  productUrl: () => "https://partner.solyn.com/?ref=SammyC"
});
