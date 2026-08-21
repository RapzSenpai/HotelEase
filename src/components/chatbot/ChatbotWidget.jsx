import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Sparkles, ChevronRight, Copy, Check, ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { sendMessage } from "@/services/chatbotService";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const QUICK_REPLIES = [
  { label: "View available rooms", followUp: "View available rooms" },
  { label: "How do I book?", followUp: "How do I book a room?" },
  { label: "Check-in hours", followUp: "What are your check-in hours?" },
  { label: "Payment methods", followUp: "What payment methods do you accept?" },
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

function detectFollowUpCategory(text) {
  const lower = text.toLowerCase();
  if (/\broom\b|suite|deluxe|standard|rate|₱|php/i.test(lower)) return "room";
  if (/\bbook|reserv/i.test(lower)) return "book";
  if (/\bpay|gcash|bank transfer|credit|debit|over.the.counter/i.test(lower)) return "payment";
  if (/\bcheck.in|check.out|arrival|depart/i.test(lower)) return "check";
  return null;
}

const markdownComponents = {
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground/60 transition-colors"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="list-inside list-disc space-y-1 pl-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-inside list-decimal space-y-1 pl-1">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <pre className="my-2 overflow-x-auto rounded-xl border border-border bg-background p-3 text-xs font-mono">
          <code>{children}</code>
        </pre>
      );
    }
    return (
      <code className="rounded-md bg-foreground/8 px-1.5 py-0.5 text-xs font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <>{children}</>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border bg-background">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2">{children}</td>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-primary pl-3 text-foreground/70 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
};

function ActionBar({ content, onRegenerate }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard API unavailable or blocked */
    }
  };

  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-md p-1 text-foreground/30 transition-colors hover:text-foreground/60"
        aria-label="Copy message"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          className="rounded-md p-1 text-foreground/30 transition-colors hover:text-foreground/60"
          aria-label="Regenerate response"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function EmptyState({ quickReplies, onSelect }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>
      <p className="text-sm font-medium text-foreground">HotelEase Assistant</p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-[240px]">
        Ask me about rooms, booking, check-in, or anything about your stay.
      </p>
      {quickReplies && quickReplies.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {quickReplies.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => onSelect(q.followUp)}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatbotWidget() {
  const { trainingMode } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
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

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setIsAtBottom(atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  const appendUserAndReply = useCallback(
    async (text, isRegenerate = false) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const historyForApi = messages
        .filter((m) => m.id !== "welcome")
        .slice(-6)
        .map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
        }));

      if (isRegenerate) {
        setMessages((prev) => {
          const withoutLastAssistant = prev.filter(
            (m) => !(m.role === "assistant" && m.id !== "welcome"),
          );
          return [...withoutLastAssistant];
        });
      } else {
        const userMsg = {
          id: `u-${Date.now()}`,
          role: "user",
          content: trimmed.slice(0, 300),
          at: new Date(),
        };
        setShowQuickReplies(false);
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
      }

      setLoading(true);

      try {
        const reply = await sendMessage(trimmed, historyForApi, null, { trainingMode });
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

  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) appendUserAndReply(lastUserMsg.content, true);
  }, [messages, appendUserAndReply]);

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

  const isOnlyWelcome = messages.length === 1 && messages[0].id === "welcome";

  return (
    <>
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex flex-col items-end">
        {/* Chat Panel */}
        <div
          className={`pointer-events-auto mb-3 origin-bottom-right transition-all duration-300 ease-out ${
            open
              ? "scale-100 opacity-100 translate-y-0 visible"
              : "scale-95 opacity-0 translate-y-2 pointer-events-none invisible"
          }`}
        >
          <div className="flex h-[540px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            {/* Header */}
            <div className="flex shrink-0 items-center bg-primary px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
                  <Sparkles className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight text-primary-foreground">HotelEase Assistant</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-primary-foreground/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    Online
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div ref={listRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-y-auto">
              {isOnlyWelcome ? (
                <EmptyState quickReplies={QUICK_REPLIES} onSelect={appendUserAndReply} />
              ) : (
                <div className="space-y-4 px-4 py-4">
                  {messages.map((m) => {
                    if (m.role === "user") {
                      return (
                        <div key={m.id} className="flex justify-end">
                          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm font-medium leading-relaxed text-primary-foreground">
                            {m.content}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={m.id} className="group relative flex justify-start">
                        <div className="w-full max-w-[92%] text-sm text-foreground">
                          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {m.content}
                          </Markdown>
                        </div>
                        {m.id !== "welcome" && (
                          <div className="absolute -right-1 -top-1">
                            <ActionBar content={m.content} onRegenerate={handleRegenerate} />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Typing indicator */}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-1 py-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/30 [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/30 [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/30" />
                      </div>
                    </div>
                  )}

                  {/* Quick replies */}
                  {showQuickReplies && messages.length <= 1 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {QUICK_REPLIES.map((q) => (
                        <button
                          key={q.label}
                          type="button"
                          disabled={loading}
                          onClick={() => appendUserAndReply(q.followUp)}
                          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground/20 hover:bg-foreground/5 disabled:pointer-events-none disabled:opacity-50"
                        >
                          {q.label}
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
                          className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary hover:text-primary"
                        >
                          {s.label}
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Scroll to bottom button */}
              {!isAtBottom && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                  <button
                    type="button"
                    onClick={scrollToBottom}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white text-foreground/60 shadow-md transition-all hover:shadow-lg hover:text-foreground"
                    aria-label="Scroll to bottom"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Composer — unified container */}
            <form onSubmit={onSubmit} className="shrink-0 border-t border-border bg-white p-3">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-1 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, 300))}
                  placeholder="Ask about rooms, booking, or policies…"
                  disabled={loading}
                  maxLength={300}
                  className="h-10 flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:brightness-110 active:scale-95 disabled:opacity-40"
                  aria-label="Send message"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* FAB */}
        <div className="pointer-events-auto" title="Chat with us">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="group flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105 active:scale-95"
            style={{ background: "#F5C518" }}
            aria-label={open ? "Close chat" : "Open chat"}
          >
            {open ? (
              <X className="h-5 w-5 transition-transform duration-200" style={{ color: "#1C1C1E" }} />
            ) : (
              <MessageCircle className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" style={{ color: "#1C1C1E" }} />
            )}
          </button>
        </div>
      </div>
    </>
  );
}
