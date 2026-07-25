import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
  Bot,
  User,
  ChevronRight,
  BedDouble,
  Calendar,
  CreditCard,
  HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { sendMessage } from "@/services/chatbotService";

const QUICK_REPLIES = [
  { label: "View available rooms", icon: BedDouble, followUp: "View available rooms" },
  { label: "How do I book?", icon: Calendar, followUp: "How do I book a room?" },
  { label: "Check-in hours", icon: HelpCircle, followUp: "What are your check-in hours?" },
  { label: "Payment methods", icon: CreditCard, followUp: "What payment methods do you accept?" },
];

const FOLLOW_UP_MAP = {
  room: [
    { label: "Book this room", followUp: "I'd like to book a room" },
    { label: "See more rooms", followUp: "What other rooms are available?" },
  ],
  book: [
    { label: "Check-in process", followUp: "What is the check-in process?" },
    { label: "Payment options", followUp: "What payment methods do you accept?" },
  ],
  payment: [
    { label: "How to pay via GCash", followUp: "How do I pay with GCash?" },
    { label: "Over-the-counter", followUp: "Can I pay at the front desk?" },
  ],
  check: [
    { label: "Late check-out", followUp: "Is late check-out available?" },
    { label: "Early check-in", followUp: "Can I check in early?" },
  ],
};

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
}

function detectFollowUpCategory(text) {
  const lower = text.toLowerCase();
  if (/\broom\b|suite|deluxe|standard|rate|₱|php/i.test(lower)) return "room";
  if (/\bbook|reserv/i.test(lower)) return "book";
  if (/\bpay|gcash|bank transfer|credit|debit|over.the.counter/i.test(lower)) return "payment";
  if (/\bcheck.in|check.out|arrival|depart/i.test(lower)) return "check";
  return null;
}

function renderFormattedText(text) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const parts = [];
    const regex = /(\*\*(.+?)\*\*|`(.+?)`|((?:https?:\/\/)[^\s]+))/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      if (match[2]) {
        parts.push(<strong key={`${i}-${match.index}`} className="font-semibold">{match[2]}</strong>);
      } else if (match[3]) {
        parts.push(
          <code key={`${i}-${match.index}`} className="rounded bg-foreground/10 px-1.5 py-0.5 text-xs font-mono">
            {match[3]}
          </code>
        );
      } else if (match[4]) {
        parts.push(
          <a
            key={`${i}-${match.index}`}
            href={match[4]}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 decoration-foreground/30 hover:decoration-foreground/60 transition-colors"
          >
            {match[4]}
          </a>
        );
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    const trimmed = line.trimStart();
    if (trimmed.startsWith("• ") || trimmed.startsWith("- ")) {
      return (
        <div key={i} className="flex gap-1.5 py-0.5">
          <span className="text-primary mt-0.5 shrink-0">•</span>
          <span>{parts.length > 0 ? parts : trimmed.slice(2)}</span>
        </div>
      );
    }
    if (/^\d+\.\s/.test(trimmed)) {
      const numMatch = trimmed.match(/^(\d+)\.\s(.*)/);
      return (
        <div key={i} className="flex gap-1.5 py-0.5">
          <span className="text-primary font-medium mt-0.5 shrink-0">{numMatch[1]}.</span>
          <span>{parts.length > 0 ? parts : numMatch[2]}</span>
        </div>
      );
    }

    return (
      <span key={i}>
        {parts.length > 0 ? parts : line}
        {i < lines.length - 1 && <br />}
      </span>
    );
  });
}

export default function ChatbotWidget() {
  const { trainingMode } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

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
        content: "Hello! Welcome to HotelEase. I'm your virtual concierge — here to help you find the perfect room, assist with reservations, and answer any questions about your stay.",
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

  const lastAssistantMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].id !== "welcome") return messages[i];
    }
    return null;
  }, [messages]);

  const followUpSuggestions = useMemo(() => {
    if (!lastAssistantMsg || loading) return [];
    const category = detectFollowUpCategory(lastAssistantMsg.content);
    return category ? FOLLOW_UP_MAP[category] : [];
  }, [lastAssistantMsg, loading]);

  return (
    <>
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex flex-col items-end">
        {/* Chat Panel */}
        <div
          className={`pointer-events-auto mb-3 origin-bottom-right transition-all duration-300 ease-out ${
            open
              ? "scale-100 opacity-100 translate-y-0"
              : "scale-95 opacity-0 translate-y-2 pointer-events-none"
          }`}
        >
          <Card className="flex h-[540px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border-0 shadow-2xl"
            style={{ background: "#F4F4F2" }}
          >
            {/* Header — dark with yellow accent */}
            <CardHeader
              className="flex flex-row items-center justify-between space-y-0 px-4 py-3 shrink-0"
              style={{
                background: "linear-gradient(135deg, #1C1C1E 0%, #2a2a2d 100%)",
                borderBottom: "2px solid #F5C518",
              }}
            >
              <div className="flex items-center gap-3">
                {/* Bot avatar */}
                <div
                  className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "rgba(245,197,24,0.15)", border: "1px solid rgba(245,197,24,0.35)" }}
                >
                  <Sparkles className="h-5 w-5" style={{ color: "#F5C518" }} />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2"
                    style={{ borderColor: "#1C1C1E", background: "#22C55E" }}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#FFFFFF" }}>
                    HotelEase Assistant
                  </p>
                  <p className="text-xs" style={{ color: "rgba(245,197,24,0.75)" }}>
                    Virtual Concierge · Online
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-lg transition-all hover:scale-105"
                style={{ color: "rgba(255,255,255,0.6)" }}
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                onMouseEnter={(e) => { e.currentTarget.style.color = "#F5C518"; e.currentTarget.style.background = "rgba(245,197,24,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.6)"; e.currentTarget.style.background = "transparent"; }}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-0 overflow-hidden p-0">
              {/* Messages */}
              <div
                ref={listRef}
                className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
                style={{ background: "#F4F4F2" }}
              >
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                  >
                    {/* Avatar */}
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={
                        m.role === "user"
                          ? { background: "#1C1C1E" }
                          : { background: "rgba(245,197,24,0.18)", border: "1px solid rgba(245,197,24,0.3)" }
                      }
                    >
                      {m.role === "user" ? (
                        <User className="h-3.5 w-3.5" style={{ color: "#F5C518" }} />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" style={{ color: "#F5C518" }} />
                      )}
                    </div>

                    {/* Bubble */}
                    <div className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"} max-w-[80%]`}>
                      <div
                        className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
                        style={
                          m.role === "user"
                            ? {
                                background: "#F5C518",
                                color: "#1C1C1E",
                                borderBottomRightRadius: "6px",
                                fontWeight: 500,
                              }
                            : {
                                background: "#FFFFFF",
                                color: "#1C1C1E",
                                borderBottomLeftRadius: "6px",
                                border: "1px solid #E6E6E1",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                              }
                        }
                      >
                        {m.role === "assistant" ? renderFormattedText(m.content) : m.content}
                      </div>
                      <span className="mt-1 px-1 text-[10px]" style={{ color: "rgba(28,28,30,0.4)" }}>
                        {formatTime(m.at instanceof Date ? m.at : new Date(m.at))}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                {loading && (
                  <div className="flex gap-2.5">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: "rgba(245,197,24,0.18)", border: "1px solid rgba(245,197,24,0.3)" }}
                    >
                      <Bot className="h-3.5 w-3.5" style={{ color: "#F5C518" }} />
                    </div>
                    <div
                      className="rounded-2xl rounded-bl-md px-4 py-3"
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid #E6E6E1",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      }}
                    >
                      <span className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" style={{ background: "#F5C518" }} />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" style={{ background: "#F5C518" }} />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: "#F5C518" }} />
                      </span>
                    </div>
                  </div>
                )}

                {/* Quick replies (initial) */}
                {showQuickReplies && messages.length <= 1 && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {QUICK_REPLIES.map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        disabled={loading}
                        onClick={() => appendUserAndReply(q.followUp)}
                        className="group flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-all disabled:opacity-50"
                        style={{
                          background: "#FFFFFF",
                          border: "1px solid #E6E6E1",
                          color: "#1C1C1E",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "#F5C518";
                          e.currentTarget.style.background = "rgba(245,197,24,0.06)";
                          e.currentTarget.style.boxShadow = "0 2px 8px rgba(245,197,24,0.2)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "#E6E6E1";
                          e.currentTarget.style.background = "#FFFFFF";
                          e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                        }}
                      >
                        <div
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: "rgba(245,197,24,0.15)" }}
                        >
                          <q.icon className="h-3 w-3" style={{ color: "#F5C518" }} />
                        </div>
                        <span>{q.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Follow-up suggestions */}
                {!loading && !showQuickReplies && followUpSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {followUpSuggestions.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => appendUserAndReply(s.followUp)}
                        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all"
                        style={{
                          background: "rgba(245,197,24,0.1)",
                          border: "1px solid rgba(245,197,24,0.4)",
                          color: "#1C1C1E",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(245,197,24,0.2)";
                          e.currentTarget.style.borderColor = "#F5C518";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(245,197,24,0.1)";
                          e.currentTarget.style.borderColor = "rgba(245,197,24,0.4)";
                        }}
                      >
                        {s.label}
                        <ChevronRight className="h-3 w-3" style={{ color: "#F5C518" }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Input area */}
              <form
                onSubmit={onSubmit}
                className="shrink-0 px-3 pb-3 pt-2.5"
                style={{
                  background: "#FFFFFF",
                  borderTop: "1px solid #E6E6E1",
                }}
              >
                <div className="flex items-center gap-2">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value.slice(0, 300))}
                    placeholder="Ask about rooms, booking, or policies…"
                    disabled={loading}
                    maxLength={300}
                    className="flex-1 h-10 rounded-xl text-sm transition-all"
                    style={{
                      background: "#F4F4F2",
                      border: "1px solid #E6E6E1",
                      color: "#1C1C1E",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#F5C518";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(245,197,24,0.15)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#E6E6E1";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={loading || !input.trim()}
                    className="shrink-0 h-10 w-10 rounded-xl transition-all hover:scale-105 active:scale-95"
                    style={{
                      background: "#F5C518",
                      color: "#1C1C1E",
                    }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "#e8b800"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#F5C518"; }}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-1.5 text-center text-[10px]" style={{ color: "rgba(28,28,30,0.35)" }}>
                  HotelEase AI · For hotel inquiries only
                </p>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* FAB — always yellow */}
        <div className="pointer-events-auto relative" title="Chat with us">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="group flex items-center justify-center rounded-2xl shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105 active:scale-95"
            style={{
              background: "#F5C518",
              height: open ? "48px" : "56px",
              width: open ? "48px" : "56px",
              borderRadius: open ? "14px" : "18px",
            }}
            aria-label={open ? "Close chat" : "Open chat"}
          >
            {open ? (
              <X className="h-5 w-5 transition-transform duration-200" style={{ color: "#1C1C1E" }} />
            ) : (
              <MessageCircle className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" style={{ color: "#1C1C1E" }} />
            )}
          </button>
          {!open && (
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full"
                style={{ background: "rgba(245,197,24,0.6)" }}
              />
              <span
                className="relative inline-flex h-3.5 w-3.5 rounded-full"
                style={{ background: "#F5C518" }}
              />
            </span>
          )}
        </div>
      </div>
    </>
  );
}
