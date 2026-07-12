import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { sendMessage } from "@/services/chatbotService";

const PRIMARY = "#F5C518";
const BTN_SIZE = 56;

const WELCOME_TEXT =
  "Hello! 👋 Welcome to HotelEase. I'm your concierge, here to help you find the perfect room, assist with reservations, and answer any questions about your stay. How can I help you today?";

const QUICK_REPLIES = [
  "View available rooms 🏨",
  "How do I book a room?",
  "What are your check-in hours?",
  "What payment methods do you accept?",
];

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function ChatbotWidget() {
  const { trainingMode } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setMessages([]);
      setInput("");
      setShowQuickReplies(true);
      setLoading(false);
      return;
    }
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: WELCOME_TEXT,
        at: new Date(),
      },
    ]);
    setShowQuickReplies(true);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  const appendUserAndReply = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed.slice(0, 300),
        at: new Date(),
      };

      const historyForApi = messages
        .filter((m) => m.id !== "welcome")
        .slice(-6)
        .map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
        }));

      setShowQuickReplies(false);
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const reply = await sendMessage(userMsg.content, historyForApi, null, {
          trainingMode,
        });
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: reply,
            at: new Date(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, trainingMode],
  );

  const onSubmit = (e) => {
    e.preventDefault();
    appendUserAndReply(input);
  };

  const handleChip = (q) => appendUserAndReply(q);

  return (
    <>
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex flex-col items-end">
        {open && (
          <Card
            className="pointer-events-auto mb-3 flex h-[500px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border-border/80 shadow-xl"
            style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.12)" }}
          >
            <CardHeader
              className="flex flex-row items-start justify-between gap-2 space-y-0 border-b border-black/5 px-4 py-3"
              style={{ backgroundColor: PRIMARY }}
            >
              <div className="flex min-w-0 items-start gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/10">
                  <Sparkles className="h-5 w-5 text-[#1C1C1E]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#1C1C1E]">HotelEase Assistant</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-[#1C1C1E]/80">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" />
                    Online
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-[#1C1C1E] hover:bg-surface-hover"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-0 overflow-hidden p-0">
              <div
                ref={listRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#FAFAF8] px-3 py-3"
              >
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className="max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed"
                      style={
                        m.role === "user"
                          ? { backgroundColor: "#1C1C1E", color: "#fff" }
                          : { backgroundColor: "#F4F4F2", color: "#1C1C1E" }
                      }
                    >
                      {m.content}
                    </div>
                    <span className="mt-1 text-[10px] text-foreground/40">
                      {formatTime(m.at instanceof Date ? m.at : new Date(m.at))}
                    </span>
                  </div>
                ))}

                {showQuickReplies && messages.length <= 1 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {QUICK_REPLIES.map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={loading}
                        onClick={() => handleChip(q)}
                        className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground/80 shadow-sm transition-colors hover:bg-surface-hover disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {loading && (
                  <div className="flex items-start">
                    <div className="rounded-2xl bg-[#F4F4F2] px-3.5 py-2.5">
                      <span className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/35 [animation-delay:-0.2s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/35 [animation-delay:-0.1s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/35" />
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <form
                onSubmit={onSubmit}
                className="border-t border-border bg-background p-3"
              >
                <div className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value.slice(0, 300))}
                    placeholder="Type your message..."
                    disabled={loading}
                    maxLength={300}
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={loading || !input.trim()}
                    className="shrink-0"
                    style={{ backgroundColor: PRIMARY, color: "#1C1C1E" }}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="pointer-events-auto relative" title="Chat with us">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.98] ${!open ? "animate-pulse" : ""}`}
            style={{
              width: BTN_SIZE,
              height: BTN_SIZE,
              backgroundColor: PRIMARY,
            }}
            aria-label={open ? "Close chat" : "Open chat"}
          >
            <MessageCircle className="h-7 w-7 text-[#1C1C1E]" />
          </button>
        </div>
      </div>
    </>
  );
}
