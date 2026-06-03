import { createWooCommerceHandler } from "./_shared/woocommerce-feed.mjs";

const SITE = (process.env.ONEDAY_BASE_URL || "https://onedaycompounds.net").replace(/\/+$/, "");
const AFFILIATE_URL = process.env.ONEDAY_AFFILIATE_URL || `${SITE}/?ref=subileue`;

export const handler = createWooCommerceHandler({
  vendor: "Oneday Compounds",
  ckEnv: "ONEDAY_CK",
  csEnv: "ONEDAY_CS",
  base: `${SITE}/wp-json/wc/v3`,
  productUrl: () => AFFILIATE_URL
});
