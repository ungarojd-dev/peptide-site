import { createWooCommerceHandler } from "./_shared/woocommerce-feed.mjs";

export const handler = createWooCommerceHandler({
  vendor: "Glacier Aminos",
  ckEnv: "GLACIER_CK",
  csEnv: "GLACIER_CS",
  base: "https://glacieraminos.shop/wp-json/wc/v3"
});
