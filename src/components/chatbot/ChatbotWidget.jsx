import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { MessageCircle, X, Sparkles, Copy, Check, ArrowUp, RotateCcw } from "lucide-react";
import { sendMessage } from "@/services/chatbotService";
import { useAuth } from "@/contexts/AuthContext";
import {
  parseStructuredBlock,
  RoomsBlock,
  BookingSummaryBlock,
  buildBookingPath,
} from "@/components/chatbot/bookingBlocks";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const UNAVAILABLE_TEXT =
  "I'm having trouble responding right now. Please try again in a moment.";

function buildMarkdownComponents({ signedIn, onSelectRoom, onBook }) {
  return {
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
    const block = parseStructuredBlock(className, children);
    if (block?.type === "rooms") {
      return <RoomsBlock data={block.data} onSelect={onSelectRoom} />;
    }
    if (block?.type === "booking-summary") {
      return <BookingSummaryBlock data={block.data} signedIn={signedIn} onBook={onBook} />;
    }
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
  hr: () => <hr className="my-3 border-border" />};
}

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

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
      <p className="text-sm font-semibold text-foreground">Looking for a room?</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Give me your dates and guest count, and I'll check what's free.
      </p>
    </div>
  );
}

/** "8:00 AM" in the viewer's local time, or null when resetAt is unusable. */
function formatResetTime(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatbotWidget({ positionClass = "bottom-6 right-6", roomContext = null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [capped, setCapped] = useState(false);
  const [quota, setQuota] = useState(null);
  const [resetAt, setResetAt] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setMessages([]);
      setInput("");
      setLoading(false);
      return;
    }
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "Hi! I can check which rooms are free and what they cost, and help you start a booking.",
        at: new Date()},
    ]);
    setCapped(false);
    setQuota(null);
    setResetAt(null);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  const appendUserAndReply = useCallback(
    async (text, isRegenerate = false) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const historyForApi = messages
        .filter((m) => m.id !== "welcome")
        .slice(-6)
        .map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content}));

      if (isRegenerate) {
        setMessages((prev) => {
          const withoutLastAssistant = prev.filter(
            (m) => !(m.role === "assistant" && m.id !== "welcome"));
          return [...withoutLastAssistant];
        });
      } else {
        const userMsg = {
          id: `u-${Date.now()}`,
          role: "user",
          content: trimmed.slice(0, 300),
          at: new Date()};
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
      }

      setLoading(true);

      try {
        const result = await sendMessage(trimmed, historyForApi, roomContext);
        if (Number.isFinite(result?.remainingToday) && Number.isFinite(result?.dailyLimit)) {
          setQuota({ remainingToday: result.remainingToday, dailyLimit: result.dailyLimit });
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: result.reply,
            at: new Date()},
        ]);
      } catch (e) {
        if (e?.code === "DAILY_CAP") {
          // The greyed composer + capped card already say it; no extra bubble.
          setCapped(true);
          setResetAt(typeof e.resetAt === "string" ? e.resetAt : null);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `e-${Date.now()}`,
              role: "assistant",
              content: e?.message || UNAVAILABLE_TEXT,
              at: new Date()},
          ]);
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, roomContext]);

  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) appendUserAndReply(lastUserMsg.content, true);
  }, [messages, appendUserAndReply]);

  const handleSelectRoom = useCallback(
    (text) => appendUserAndReply(text),
    [appendUserAndReply]);

  const handleBook = useCallback(
    (data) => {
      const path = buildBookingPath(data);
      if (user?.uid) {
        navigate(path);
      } else {
        // Carry the prefilled booking link through login (LoginPage honors
        // location.state.from) so the guest lands ready to confirm.
        navigate("/login", { state: { from: path } });
      }
    },
    [navigate, user?.uid]);

  const markdownComponents = useMemo(
    () =>
      buildMarkdownComponents({
        signedIn: Boolean(user?.uid),
        onSelectRoom: handleSelectRoom,
        onBook: handleBook}),
    [user?.uid, handleSelectRoom, handleBook]);

  const onSubmit = (e) => {
    e.preventDefault();
    appendUserAndReply(input);
  };

  const isOnlyWelcome = messages.length === 1 && messages[0].id === "welcome";
  const resetLabel = formatResetTime(resetAt);

  return (
    <>
      <div className={`pointer-events-none fixed ${positionClass} z-[100] flex flex-col items-end`}>
        {/* Chat Panel */}
        <div
          className={`pointer-events-auto mb-3 origin-bottom-right transition-all duration-300 ease-out ${open
            ? "scale-100 opacity-100 translate-y-0 visible"
            : "scale-95 opacity-0 translate-y-2 pointer-events-none invisible"
            }`}
        >
          <div className="flex w-[380px] max-w-[calc(100vw-2rem)] max-h-[min(500px,calc(100vh-160px))] flex-col overflow-hidden rounded-2xl border border-border/60 bg-white shadow-[0_1px_2px_rgba(28,28,30,0.04),0_12px_32px_rgba(28,28,30,0.12)]">

            {/* Header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-5 py-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-playfair text-sm font-semibold leading-tight text-foreground">
                  HotelEase chat
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-none text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  Ask about rooms, rates, and availability
                </p>
              </div>
              {quota &&
                Number.isFinite(quota.remainingToday) &&
                Number.isFinite(quota.dailyLimit) &&
                (quota.dailyLimit <= 5 || quota.remainingToday <= 5) && (
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {quota.remainingToday} of {quota.dailyLimit} left today
                  </span>
                )}
            </div>

            {/* Messages */}
            <div ref={listRef} className={`min-h-0 flex-1 overflow-y-auto${isOnlyWelcome ? " flex flex-col" : ""}`}>
              {isOnlyWelcome ? (
                <EmptyState />
              ) : (
                <div className="space-y-4 px-5 py-4">
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
                </div>
              )}
            </div>

            {/* Composer — unified container (locked after daily cap) */}
            {capped ? (
              <div className="shrink-0 bg-white p-3">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1 opacity-60">
                  <input
                    disabled
                    placeholder="Out of messages for today"
                    className="h-10 flex-1 cursor-not-allowed bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-40"
                    aria-label="Send message"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-center">
                  <p className="text-sm font-medium text-foreground">
                    {user?.uid ? "Daily message limit reached" : "Free messages used up"}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {resetLabel ? `Resets at ${resetLabel}.` : "Resets tomorrow."}
                    {!user?.uid && " Sign in for more messages."}
                  </p>
                  {!user?.uid && (
                    <NavLink
                      to="/login"
                      className="mt-2.5 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-5 text-xs font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-95"
                    >
                      Sign In to Continue
                    </NavLink>
                  )}
                </div>
              </div>
            ) : (
              <div className="shrink-0 bg-white p-3">
                <form onSubmit={onSubmit}>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1 transition-all focus-within:ring-[3px] focus-within:ring-ring/50">
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
            )}
          </div>
        </div>

        {/* FAB */}
        <div className="pointer-events-auto" title="Chat with us">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="group flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_20px_rgba(28,28,30,0.18)] transition-all duration-200 hover:scale-105 hover:shadow-[0_8px_28px_rgba(28,28,30,0.22)] active:scale-95"
            aria-label={open ? "Close chat" : "Open chat"}
          >
            {open ? (
              <X className="h-5 w-5 transition-transform duration-200" />
            ) : (
              <MessageCircle className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />
            )}
          </button>
        </div>
      </div>
    </>
  );
}
