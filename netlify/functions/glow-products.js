import { createWooCommerceHandler } from "./_shared/woocommerce-feed.mjs";

export const handler = createWooCommerceHandler({
  vendor: "Glow Aminos",
  ckEnv: "GLOW_CK",
  csEnv: "GLOW_CS",
  base: "https://glowaminos.com/wp-json/wc/v3"
});
