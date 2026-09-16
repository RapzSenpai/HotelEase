// Moved verbatim from src/index.js — Groq forward, no logic changes.
import { GROQ_API_URL, MODEL_ID } from "./config.js";

export async function callGroq(apiKey, messages, { maxTokens = 300, temperature = 0.7, extraBody = {} } = {}) {
  const groqRes = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_ID,
      messages,
      max_tokens: maxTokens,
      temperature,
      // gpt-oss is a reasoning model: hidden thinking tokens count against
      // max_tokens. "low" keeps answers from being truncated mid-JSON.
      reasoning_effort: "low",
      ...extraBody,
    }),
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    const err = new Error(`Groq upstream error: ${errText.slice(0, 300)}`);
    err.status = groqRes.status;
    throw err;
  }

  const data = await groqRes.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}
