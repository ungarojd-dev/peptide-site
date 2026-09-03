// Subscribes an address to the EmailOctopus list.
//
// Uses API v2. v1.6 is legacy and rejects the newer eo_ prefixed keys, which
// surfaced as a misleading "invalid email address" because the old code mapped
// the upstream parameter error onto the email field. v2 takes the key as a
// Bearer header and lowercase status values.
//
// Double opt-in on purpose: EmailOctopus does not prohibit our category, but
// its acceptable use policy turns on consent rather than industry, and
// affiliate senders get extra scrutiny at account review. A confirmed opt-in is
// the record that survives that review, and it keeps the list deliverable.
//
// Credentials live in Netlify env vars only. The repo is public.
//   EMAILOCTOPUS_API_KEY
//   EMAILOCTOPUS_LIST_ID

const TIMEOUT_MS = 10000;
const API_BASE = "https://api.emailoctopus.com";

// Deliberately permissive. Address validity is proven by the confirmation
// click, not by a clever regex, so this only catches obvious typos.
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
  // Returns success so the bot has nothing to learn from the response.
  //
  // Logged before returning, because when this fired silently on autofilled
  // "company" values there was no trace of why a signup vanished: the function
  // returned 200, wrote nothing, and no contact was ever created.
  if (payload.hp) {
    console.warn("subscribe: honeypot triggered, request dropped");
    return json(200, { ok: true });
  }

  // Entry log. Confirms the request reached the current build and shows which
  // fields arrived, without ever writing the address itself.
  console.log("subscribe: request received, hp:", payload.hp ? "filled" : "empty",
              "consent:", payload.consent === true);

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
      `${API_BASE}/lists/${encodeURIComponent(listId)}/contacts`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          email_address: email,
          // Lowercase in v2. Triggers EmailOctopus's own confirmation email, so
          // the double opt-in is handled by them rather than rebuilt here.
          status: "pending",
          fields: { Source: String(payload.source || "site").slice(0, 60) }
        })
      }
    );

    // Logged on success too. Two paths previously returned 200 while writing
    // nothing at all, a real create and a 409 duplicate, so an empty log could
    // not distinguish "it worked" from "it silently did nothing". Every branch
    // now leaves a trace.
    if (res.ok) {
      console.log("subscribe: created contact, status", res.status, "list", String(listId).slice(0, 8));
      return json(200, { ok: true });
    }

    const data = await res.json().catch(() => ({}));
    const code = String(data?.error?.code || data?.code || "");

    // Already on the list is not a real failure. Telling a stranger whether a
    // given address is subscribed would leak membership, so this returns the
    // same confirmation copy as a new signup.
    if (res.status === 409 || /CONFLICT|MEMBER_EXISTS/i.test(code)) {
      console.log("subscribe: contact already on list, status", res.status, code);
      return json(200, { ok: true });
    }
    // Only a genuine validation rejection should blame the email field. Auth
    // and config failures previously fell through to this message and sent
    // people re-typing a perfectly good address.
    if (res.status === 422 || /INVALID_PARAMETERS|VALIDATION/i.test(code)) {
      return json(400, { error: "Please enter a valid email address." });
    }
    if (res.status === 401 || res.status === 403) {
      console.error("subscribe: auth rejected by EmailOctopus", res.status, code);
      return json(502, { error: "Signup is temporarily unavailable. Please try again later." });
    }

    console.error("subscribe: EmailOctopus error", res.status, code);
    return json(502, { error: "Signup is temporarily unavailable. Please try again later." });
  } catch (err) {
    console.error("subscribe: request failed", err?.name || err);
    return json(504, { error: "Signup timed out. Please try again." });
  } finally {
    clearTimeout(timer);
  }
}
