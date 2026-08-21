import { listRooms } from "@/services/roomsService";

// The Groq API key never ships to the browser. Chat requests are forwarded to a
// Cloudflare Worker proxy (server-side), which injects the key + rate limits.
// See /worker. The proxy URL is configured via VITE_GROQ_PROXY_URL.
const GROQ_PROXY_URL = import.meta.env.VITE_GROQ_PROXY_URL;

const SYSTEM_PROMPT = `You are HotelEase Assistant, a direct and helpful concierge chatbot for HotelEase — a hotel management system for the BSHM department at Consolatrix Suites, Toledo City.

You ONLY answer questions related to:
- Room availability, types, and rates
- Booking process and how to make a reservation
- Check-in time (2:00 PM) and check-out time (12:00 NN)
- Room amenities and inclusions
- Payment methods: GCash and Bank Transfer (upload proof online), or Over-the-Counter and Credit/Debit Card (pay at the front desk upon arrival)
- Hotel announcements and events
- General hotel policies and hospitality questions

RULES:
1. Never say "visit the page", "go to the website", "check the page", "navigate to", or similar phrases. The user is ALREADY on the website. Give answers directly inside the chat.
2. Be direct and concise. Get to the point fast. No filler words like "Certainly!", "Of course!", "Great question!".
3. Be action-oriented. Guide users through steps right here in the chat, not to other pages.
4. You are an INFORMATION assistant only — you cannot make bookings, payments, or changes. If asked to book or perform an action, tell them exactly which button/section to click on the page they're already viewing (e.g. "Click 'Book Now' on the room card", "Go to the Booking tab in the sidebar").
5. Keep responses short — 1-3 sentences max unless listing multiple options.
6. Use plain, conversational language. No emojis. No corporate speak.
7. Current available rooms data will be provided to you — use it to answer specific room and rate queries accurately.
8. Never make up room data — only use what is provided.
9. If a user asks anything outside of these topics, say "I can only help with hotel-related inquiries." and stop.`;

const UNAVAILABLE =
  "I'm currently unavailable. Please contact our front office for assistance.";

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
  if (!GROQ_PROXY_URL) {
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
    const response = await fetch(GROQ_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
    });

    if (!response.ok) {
      console.error(`chatbotService: Groq proxy returned ${response.status}`);
      return UNAVAILABLE;
    }

    const data = await response.json();
    return data?.content?.trim() || UNAVAILABLE;
  } catch (e) {
    console.error("chatbotService: Groq proxy error", e);
    return UNAVAILABLE;
  }
}
