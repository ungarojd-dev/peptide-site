import { getStore } from "@netlify/blobs";

// Append-only daily price history. One compact row per compound per day:
// the lowest tracked price and how many vendors it was drawn from. This is
// deliberately tiny (charts only ever need the daily low), and every write is
// wrapped so a history failure can NEVER affect live pricing.
//
// Storage layout: one blob per compound, keyed history:{product_id}, holding
// an array of { d: "YYYY-MM-DD", low: number, vendors: number }. Same-day
// writes replace that day's row rather than duplicating it, so the recorder is
// safe to run on every 15-minute refresh, not just once a day.

const STORE_NAME = "mpp-catalog-history";
const MAX_DAYS = 400; // ~13 months; trims silently so a blob cannot grow forever.

function store() {
  return getStore(STORE_NAME);
}

function dayKey(date = new Date()) {
  // UTC date stamp. Consistent regardless of which region the function runs in.
  return date.toISOString().slice(0, 10);
}

function historyKey(productId) {
  return `history:${productId}`;
}

function cardsFrom(snapshot) {
  if (!snapshot) return [];
  return snapshot.product_cards || snapshot.cards || snapshot.products || [];
}

// Records today's low for every compound in the snapshot. Returns a small
// summary for the refresh diagnostics. Never throws.
export async function recordDailyHistory(snapshot, when = new Date()) {
  const summary = { attempted: 0, written: 0, skipped: 0, failed: 0, day: dayKey(when) };
  let cards;
  try {
    cards = cardsFrom(snapshot);
  } catch {
    return summary;
  }
  if (!cards.length) return summary;

  const historyStore = store();
  const day = dayKey(when);

  // Writes run in parallel and are independently guarded: one compound failing
  // must not stop the rest, mirroring how vendor fetches are handled.
  const results = await Promise.allSettled(cards.map(async card => {
    summary.attempted += 1;
    const productId = card.product_id || card.id;
    const low = Number(card.lowest_effective_price);
    if (!productId || !Number.isFinite(low)) {
      summary.skipped += 1;
      return;
    }
    const vendors = Number(card.supplier_count) || 0;
    const key = historyKey(productId);

    let existing = [];
    try {
      const prior = await historyStore.get(key, { type: "json" });
      if (Array.isArray(prior)) existing = prior;
    } catch {
      // No prior history for this compound, or read failed; start fresh.
      existing = [];
    }

    // Replace today's row if present, so repeated refreshes keep one row per day.
    const withoutToday = existing.filter(row => row && row.d !== day);
    withoutToday.push({ d: day, low: Math.round(low * 100) / 100, vendors });
    withoutToday.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    const trimmed = withoutToday.slice(-MAX_DAYS);

    await historyStore.setJSON(key, trimmed);
    summary.written += 1;
  }));

  summary.failed = results.filter(r => r.status === "rejected").length;
  return summary;
}

// Reads a compound's history for charting. Returns [] on any failure so a
// caller can always render something. Optional day window keeps payloads small.
export async function readHistory(productId, days = 90) {
  if (!productId) return [];
  try {
    const rows = await store().get(historyKey(productId), { type: "json" });
    if (!Array.isArray(rows)) return [];
    if (!Number.isFinite(days) || days <= 0) return rows;
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    return rows.filter(row => row && row.d >= cutoffKey);
  } catch {
    return [];
  }
}
