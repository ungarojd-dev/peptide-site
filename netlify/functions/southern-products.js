import { createWooCommerceHandler } from "./_shared/woocommerce-feed.mjs";

export const handler = createWooCommerceHandler({
  vendor: "Southern Aminos",
  ckEnv: "SOUTHERN_CK",
  csEnv: "SOUTHERN_CS",
  base: "https://southernaminos.com/wp-json/wc/v3"
});
