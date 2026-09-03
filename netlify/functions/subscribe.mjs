// Subscribes an address to the EmailOctopus list.
//
// Double opt-in on purpose: EmailOctopus does not prohibit our category, but
// its acceptable use policy turns on consent rather than industry, and
// affiliate senders get extra scrutiny at account review. A confirmed opt-in is
// the record that survives that review, and it keeps the list clean enough to
// stay deliverable. Single opt-in would convert better and is not worth it here.
//
// Credentials live in Netlify env vars only. The repo is public.
//   EMAILOCTOPUS_API_KEY
//   EMAILOCTOPUS_LIST_ID

const TIMEOUT_MS = 10000;

// Deliberately permissive. Address validity is proven by the confirmation
// click, not by a clever regex, so this only catches obvious typos and keeps
// junk out of the API call.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = process.env.EMAILOCTOPUS_API_KEY;
  const listId = process.env.EMAILOCTOPUS_LIST_ID;
  if (!apiKey || !listId) {
    console.error("subscribe: EMAILOCTOPUS_API_KEY or EMAILOCTOPUS_LIST_ID not set");
    return json(500, { error: "Signup is temporarily unavailable. Please try again later." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid request." });
  }

  // Honeypot. Real people never fill a hidden field, bots fill everything.
  // Returns success rather than an error so the bot has nothing to learn from.
  if (payload.company) return json(200, { ok: true });

  const email = String(payload.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json(400, { error: "Please enter a valid email address." });
  }
  if (payload.consent !== true) {
    return json(400, { error: "Please confirm you want to receive emails." });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://emailoctopus.com/api/1.6/lists/${encodeURIComponent(listId)}/contacts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          api_key: apiKey,
          email_address: email,
          // PENDING triggers EmailOctopus's own confirmation email, so the
          // double opt-in is handled by them rather than reimplemented here.
          status: "PENDING",
          fields: { Source: String(payload.source || "site").slice(0, 60) }
        })
      }
    );
    const data = await res.json().catch(() => ({}));

    if (res.ok) return json(200, { ok: true });

    const code = data?.error?.code || "";
    // An already-subscribed address is not an error worth surfacing. Telling a
    // stranger whether a given address is on the list would leak membership, so
    // both cases get the same confirmation copy.
    if (code === "MEMBER_EXISTS_WITH_EMAIL_ADDRESS") return json(200, { ok: true });
    if (code === "INVALID_PARAMETERS") return json(400, { error: "Please enter a valid email address." });

    console.error("subscribe: EmailOctopus error", res.status, code);
    return json(502, { error: "Signup is temporarily unavailable. Please try again later." });
  } catch (err) {
    console.error("subscribe: request failed", err?.name || err);
    return json(504, { error: "Signup timed out. Please try again." });
  } finally {
    clearTimeout(timer);
  }
}
