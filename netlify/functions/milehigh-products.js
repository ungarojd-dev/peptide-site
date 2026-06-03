import { createWooCommerceHandler } from "./_shared/woocommerce-feed.mjs";

export const handler = createWooCommerceHandler({
  vendor: "Mile High Peptides",
  ckEnv: "MILEHIGH_CK",
  csEnv: "MILEHIGH_CS",
  base: "https://milehighcompounds.is/wp-json/wc/v3"
});
