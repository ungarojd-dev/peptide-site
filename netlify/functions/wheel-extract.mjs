// wheel-extract.mjs
// Reads TikTok LIVE chat screenshots and returns the usernames of viewers whose
// message contains the giveaway keyword. Powers /live-wheel.html.
//
// POST JSON: { keyword: "MPP", images: [{ media_type: "image/jpeg", data: "<base64>" }] }
// Returns:   { names: ["user1", "user2"], count: 2 }
//
// Requires the ANTHROPIC_API_KEY environment variable in Netlify.

const ALLOWED_ORIGINS = new Set([
  "https://mypeptideprice.com",
  "https://www.mypeptideprice.com"
]);

const MAX_IMAGES = 8;
const MAX_BODY_BYTES = 5.5 * 1024 * 1024;
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);
const MODEL = "claude-haiku-4-5-20251001";

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://mypeptideprice.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
}

function respond(request, status, body) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

function extractJsonArray(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default async request => {
  if (request.method === "OPTIONS") return respond(request, 200, {});
  if (request.method !== "POST") return respond(request, 405, { error: "POST only" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return respond(request, 503, { error: "ANTHROPIC_API_KEY is not configured in Netlify environment variables." });
  }

  let payload;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return respond(request, 413, { error: "Upload too large. Send fewer screenshots per batch." });
    }
    payload = JSON.parse(raw);
  } catch {
    return respond(request, 400, { error: "Invalid JSON body." });
  }

  const keyword = String(payload?.keyword || "MPP").trim().slice(0, 30);
  const images = Array.isArray(payload?.images) ? payload.images.slice(0, MAX_IMAGES) : [];
  if (!keyword) return respond(request, 400, { error: "Keyword is required." });
  if (!images.length) return respond(request, 400, { error: "At least one screenshot is required." });

  const content = [];
  for (const img of images) {
    if (!ALLOWED_MEDIA.has(img?.media_type) || typeof img?.data !== "string" || !img.data) {
      return respond(request, 400, { error: "Each image needs a supported media_type and base64 data." });
    }
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.media_type, data: img.data }
    });
  }

  content.push({
    type: "text",
    text: [
      `These are screenshots of a TikTok LIVE chat. Viewers enter a giveaway by typing the keyword "${keyword}" in chat.`,
      "",
      "Extract the exact username of every viewer whose chat MESSAGE contains that keyword (case-insensitive, so mpp, Mpp, and MPP all count, including when the keyword appears inside a longer message).",
      "",
      "Rules:",
      "- Return usernames exactly as written, preserving underscores, dots, digits, and capitalization. Do not include emojis, level badges, or icons that appear next to the name.",
      "- Ignore system lines such as joined, shared the LIVE, sent a gift, followed, or welcome messages.",
      "- Ignore messages that do not contain the keyword.",
      "- If the same username appears more than once, include it once.",
      "- If a username is partially cut off or unreadable, skip it rather than guessing.",
      "",
      "Respond with ONLY a JSON array of username strings and nothing else. No markdown, no explanation. If no valid entries are found, respond with []."
    ].join("\n")
  });

  let apiResponse;
  try {
    apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        messages: [{ role: "user", content }]
      })
    });
  } catch (error) {
    console.error("wheel-extract upstream fetch failed:", error.message);
    return respond(request, 502, { error: "Could not reach the extraction service. Try again." });
  }

  if (!apiResponse.ok) {
    const detail = await apiResponse.text().catch(() => "");
    console.error("wheel-extract API error:", apiResponse.status, detail.slice(0, 300));
    return respond(request, 502, { error: `Extraction service returned ${apiResponse.status}. Try again.` });
  }

  const data = await apiResponse.json().catch(() => null);
  const text = (data?.content || [])
    .filter(block => block?.type === "text")
    .map(block => block.text)
    .join("\n");

  const seen = new Set();
  const names = [];
  for (const entry of extractJsonArray(text)) {
    const name = String(entry || "").trim().slice(0, 60);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return respond(request, 200, { names, count: names.length });
};
