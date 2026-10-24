// Guest concierge chat: validates + sanitizes the client history, owns the
// system prompt, and runs a bounded tool loop so the model can check real
// availability and prices. One client message = one rate-limit count; tool
// rounds happen entirely in here.
import { callGroqMessage } from "../groq.js";
import { json } from "../http.js";
import { GUEST_CHAT_SYSTEM_PROMPT } from "../prompts.js";
import { GUEST_TOOLS, executeGuestTool, todayKey } from "../booking-tools.js";

const UNAVAILABLE_TEXT =
  "I'm having trouble responding right now. Please try again in a moment.";

// Tool-enabled rounds, then one final round without tools so the model must
// answer with text. 2 rounds cover find_rooms -> quote_booking.
const TOOL_ROUNDS = 2;

// Firestore auto-ids; anything else in the client hint is dropped.
const ROOM_CONTEXT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Dated tools must never receive dates the guest did not type. Models
// "helpfully" fill the required checkIn/checkOut from the current date in
// the system prompt (today, today+2); the tool result then launders those
// invented dates into the reply ("Oct 24 - Oct 26" after "I want to book").
// Scanning only the guest's OWN turns makes refusal deterministic.
const DATED_TOOLS = new Set(["find_rooms", "quote_booking"]);
const GUEST_DATE_RE = new RegExp(
  [
    "\\d{4}-\\d{2}-\\d{2}",
    "\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\s+\\d{1,2}(?:st|nd|rd|th)?\\b",
    "\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\b",
    "\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b",
  ].join("|"),
  "i",
);

const NO_DATES_ERROR =
  "The guest has not provided any dates yet — never invent dates from the " +
  "current date. Ask the guest for check-in and check-out dates first.";

/**
 * ponytail: relative dates ("tomorrow", "next weekend") match no token here
 * and pass through; name concrete dates too when it keeps being abused.
 * Upgrade: parse relative date phrasing instead of tokens.
 */

/**
 * Optional read-only hint from the widget about the room page the guest is
 * on. The id is re-validated by quote_booking and the name is flattened to a
 * single capped line so it cannot smuggle instructions into the prompt.
 */
function roomContextLine(context) {
  if (!context || typeof context !== "object") return "";
  const { roomId, name } = context;
  if (typeof roomId !== "string" || !ROOM_CONTEXT_ID_RE.test(roomId)) return "";
  const safeName = String(name ?? "")
    .replace(/[\r\n"]+/g, " ")
    .trim()
    .slice(0, 120);
  if (!safeName) return "";
  return `\n\nContext: the guest is currently viewing the room "${safeName}" (id ${roomId}). Treat "this room" or "it" as this room, but still verify availability and pricing with the tools before stating anything.`;
}

function toolResult(toolCall, result) {
  return {
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify(result),
  };
}

export async function handleChatRequest(request, workerEnv, quota = null) {
  const apiKey = workerEnv.GROQ_API_KEY;
  if (!apiKey) {
    return json({ error: "Groq proxy is not configured (missing GROQ_API_KEY secret)." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const incoming = payload?.messages;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return json({ error: "Missing messages array." }, 400);
  }
  if (incoming.length > 40) {
    return json({ error: "Too many messages." }, 400);
  }

  // Client system messages are dropped — the worker owns the system prompt so
  // instructions injected from the browser never reach the model as system.
  // Accepted but ignored so older deployed clients keep working.
  const history = [];
  for (const m of incoming) {
    if (
      !m ||
      typeof m.content !== "string" ||
      (m.role !== "user" && m.role !== "assistant" && m.role !== "system")
    ) {
      return json({ error: "Invalid message format." }, 400);
    }
    if (m.role === "system") continue;
    history.push({ role: m.role, content: m.content.slice(0, 4000) });
  }

  const messages = [
    {
      role: "system",
      content: `${GUEST_CHAT_SYSTEM_PROMPT}${roomContextLine(payload?.context)}\n\nCurrent date: ${todayKey()} (Asia/Manila).`,
    },
    ...history,
  ];

  // Provenance guard: dated tools only fire when a guest turn contains a
  // date token, checked once for the whole loop.
  const guestGaveDates = history.some(
    (m) => m.role === "user" && GUEST_DATE_RE.test(m.content),
  );

  try {
    for (let round = 0; round <= TOOL_ROUNDS; round += 1) {
      const withTools = round < TOOL_ROUNDS;
      const message = await callGroqMessage(apiKey, messages, {
        maxTokens: 600,
        // Tool calls need accuracy, not creativity — higher adherence at 0.3.
        temperature: 0.3,
        ...(withTools ? { tools: GUEST_TOOLS } : {}),
      });

      const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
      const content = typeof message?.content === "string" ? message.content.trim() : "";

      // Tool calls are only usable mid-loop, complete, and well-formed.
      // Otherwise answer with whatever text the model produced (the final
      // tool-less round can still emit stray tool_calls) or fail soft.
      const callsAreUsable =
        toolCalls.length > 0 &&
        toolCalls.every(
          (toolCall) =>
            typeof toolCall?.id === "string" && typeof toolCall?.function?.name === "string",
        );
      if (!withTools || !callsAreUsable) {
        return json({
          content: content || UNAVAILABLE_TEXT,
          ...(quota ? { remainingToday: quota.remainingToday, dailyLimit: quota.dailyLimit } : {}),
        });
      }

      messages.push({
        role: "assistant",
        content: typeof message.content === "string" && message.content ? message.content : null,
        tool_calls: toolCalls,
      });

      const results = await Promise.all(
        toolCalls.map(async (toolCall) => {
          let args = {};
          try {
            args = JSON.parse(toolCall?.function?.arguments || "{}");
          } catch {
            return toolResult(toolCall, {
              error: "Tool arguments were not valid JSON. Call the tool again with valid JSON.",
            });
          }
          // Guard: a dated call without a guest-stated date is refused without
          // touching Firestore — the model falls back to asking the guest.
          if (
            DATED_TOOLS.has(toolCall?.function?.name) &&
            !guestGaveDates &&
            (args?.checkIn || args?.checkOut)
          ) {
            return toolResult(toolCall, { error: NO_DATES_ERROR });
          }
          const result = await executeGuestTool(toolCall?.function?.name, args, workerEnv);
          return toolResult(toolCall, result);
        }),
      );
      messages.push(...results);
    }

    // Loop exhausted (model kept calling tools): fail soft, never hang.
    return json({
      content: UNAVAILABLE_TEXT,
      ...(quota ? { remainingToday: quota.remainingToday, dailyLimit: quota.dailyLimit } : {}),
    });
  } catch (e) {
    if (e.status) return json({ error: "Groq upstream error.", detail: String(e.message || e) }, e.status);
    return json({ error: "Failed to reach Groq.", detail: String(e) }, 502);
  }
}
