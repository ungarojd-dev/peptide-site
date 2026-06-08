import { triggerBackgroundRefresh } from "./_shared/catalog-refresh-trigger.mjs";

export default async request => {
  const result = await triggerBackgroundRefresh(request, "scheduled-15-minute-refresh");
  console.log(result.already_in_progress
    ? "Skipped scheduled catalog trigger because a background refresh is already active"
    : "Queued scheduled catalog refresh in the background");
};
