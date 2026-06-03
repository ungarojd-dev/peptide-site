import { createWooCommerceHandler } from "./_shared/woocommerce-feed.mjs";

export const handler = createWooCommerceHandler({
  vendor: "Flawless Compounds",
  ckEnv: "FLAWLESS_CK",
  csEnv: "FLAWLESS_CS",
  base: "https://flawlesscompounds.com/wp-json/wc/v3"
});
