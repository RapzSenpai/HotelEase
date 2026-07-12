// To get your free Groq API key:
// 1. Go to https://console.groq.com
// 2. Sign in and go to API Keys
// 3. Click "Create API Key"
// 4. Paste into .env as VITE_GROQ_API_KEY

import Groq from "groq-sdk";
import { listRooms } from "@/services/roomsService";

// KNOWN LIMITATION: Groq API key is exposed client-side (dangerouslyAllowBrowser: true).
// Firebase Spark (free) plan does not support Cloud Functions to proxy this call.
// Future work: migrate to serverless proxy (Vercel Edge Function / Cloudflare Worker)
// once deployment platform is finalized. Accepted as academic-scope risk for capstone.
const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
});

const MODEL_ID = "llama-3.1-8b-instant";

const SYSTEM_PROMPT = `You are HotelEase Assistant, a professional and friendly concierge chatbot for HotelEase — a hotel management system for the BSHM department.

You ONLY answer questions related to:
- Room availability, types, and rates
- Booking process and how to make a reservation
- Check-in time (2:00 PM) and check-out time (12:00 NN)
- Room amenities and inclusions
- Payment methods (GCash, Cash, Check, Credit Card)
- Hotel announcements and events
- General hotel policies and hospitality questions

Current available rooms data will be provided to you — use it to answer specific room and rate queries accurately.

If a user asks anything outside of these topics, respond with exactly:
'I can only assist with hotel-related inquiries. For other concerns, please contact our front office directly. 😊'

Always be polite, professional, and concise.
Keep responses under 4 sentences.
Use simple, friendly language.
You may use 1 relevant emoji per response maximum.
Never make up room data — only use what is provided.`;

const UNAVAILABLE =
  "I'm currently unavailable. Please contact our front office for assistance. 😊";

function formatRoomsLines(rooms) {
  return rooms
    .filter((r) => r.isActive !== false)
    .map((r) => {
      const roomName = r.name || r.roomNumber || "Room";
      const roomType = r.type || "—";
      const rate = Number(r.ratePerNight ?? 0);
      const status = r.status || "—";
      const amenities = Array.isArray(r.amenities)
        ? r.amenities.join(", ")
        : String(r.amenities ?? "—");
      return `${roomName} (${roomType}) - ₱${rate}/night - Status: ${status} - Amenities: ${amenities}`;
    })
    .join("\n");
}

/**
 * @param {string} userMessage
 * @param {Array<{ role: 'user' | 'assistant', content: string }>} conversationHistory - last 6 turns max (caller slices)
 * @param {string | null} roomsContext - pre-built rooms text, or null to fetch via roomsService
 * @param {{ trainingMode?: boolean | null }} [options]
 * @returns {Promise<string>}
 */
export async function sendMessage(
  userMessage,
  conversationHistory = [],
  roomsContext = null,
  options = {},
) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return UNAVAILABLE;
  }

  const { trainingMode = null } = options;

  let roomsBlock = roomsContext;
  if (roomsBlock == null || roomsBlock === "") {
    try {
      const rooms = await listRooms({ trainingMode });
      roomsBlock = formatRoomsLines(rooms);
    } catch (e) {
      console.error("chatbotService: failed to load rooms", e);
      roomsBlock = "(No room data could be loaded.)";
    }
  }

  const historyMessages = conversationHistory.slice(-6).map((turn) => ({
    role: turn.role === "user" ? "user" : "assistant",
    content: turn.content,
  }));

  try {
    const response = await groq.chat.completions.create({
      model: MODEL_ID,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT + roomsBlock,
        },
        ...historyMessages,
        {
          role: "user",
          content: userMessage,
        },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    return (
      response.choices[0]?.message?.content?.trim() || UNAVAILABLE
    );
  } catch (e) {
    console.error("chatbotService: Groq error", e);
    return UNAVAILABLE;
  }
}
