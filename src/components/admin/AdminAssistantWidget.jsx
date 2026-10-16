import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, X, Sparkles, Copy, Check, ArrowUp, RotateCcw, Megaphone, Mail, ClipboardList } from "lucide-react";
import { buildAdminContext, sendAdminChat } from "@/services/insightsService";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AssistantChart from "@/components/admin/AssistantChart";

function parseActionBlock(code) {
  try {
    const parsed = JSON.parse(String(code ?? ""));
    if (parsed && parsed.type === "draft_announcement") {
      return {
        type: "draft_announcement",
        title: String(parsed.title ?? "").slice(0, 120),
        body: String(parsed.body ?? "").slice(0, 800)};
    }
  } catch {
    // malformed JSON — caller falls back to a plain code block
  }
  return null;
}

function AssistantActionCard({ action }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const isAnnouncement = action.type === "draft_announcement";
  const fullText = isAnnouncement
    ? `${action.title}\n\n${action.body}`
    : String(action.body ?? "");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard API unavailable or blocked */
    }
  }

  return (
    <div className="my-2 rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
          {isAnnouncement ? (
            <Megaphone className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Mail className="h-3.5 w-3.5 text-primary" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
            AI Draft — {isAnnouncement ? "Announcement" : "Reply"}
          </p>
          {isAnnouncement && action.title ? (
            <p className="truncate text-sm font-semibold">{action.title}</p>
          ) : null}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-foreground/75 whitespace-pre-wrap">
        {action.body}
      </p>
      <div className="flex items-center gap-2 pt-0.5">
        {isAnnouncement ? (
          <button
            type="button"
            onClick={() =>
              navigate("/fo/announcements", {
                state: { aiDraft: { title: action.title, description: action.body } }})
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Open in Announcements
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy Draft"}
        </button>
        <span className="text-[10px] text-foreground/40">
          Nothing is posted until you review it
        </span>
      </div>
    </div>
  );
}

const WELCOME =
  "Ops Assistant online. I can see live operations (approval queues, expiring payment holds, room status), accounts, alerts, refunds, system health, and 60 days of trends. Ask anything, request a chart, or ask me to draft an announcement.";

/** "8:00 AM" in the viewer's local time, or null when resetAt is unusable. */
function formatResetTime(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const markdownComponents = {
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="list-inside list-disc space-y-1 pl-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-inside list-decimal space-y-1 pl-1">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
  hr: () => <hr className="my-3 border-border" />,
  code: ({ className, children }) => {
    if (className?.includes("language-chart")) {
      return <AssistantChart code={String(children ?? "")} />;
    }
    if (className?.includes("language-action")) {
      const action = parseActionBlock(children);
      if (action) return <AssistantActionCard action={action} />;
      // Malformed action JSON — fall through to a plain code block.
    }
    const isBlock = Boolean(className);
    if (isBlock) {
      return (
        <pre className="my-2 overflow-x-auto rounded-xl border border-border bg-background p-3 text-xs font-mono">
          <code>{children}</code>
        </pre>
      );
    }
    return <code className="rounded-md bg-foreground/8 px-1.5 py-0.5 text-xs font-mono">{children}</code>;
  },
  pre: ({ children }) => <>{children}</>};

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

function EmptyState({ contextReady }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
      <p className="text-sm font-semibold text-foreground">
        {contextReady ? "What would you like to know?" : "Loading hotel data…"}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {contextReady
          ? "Live operations, accounts, alerts, refunds, and 60 days of trends."
          : "Fetching the latest snapshot…"}
      </p>
    </div>
  );
}

export default function AdminAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextReady, setContextReady] = useState(true);
  const [capped, setCapped] = useState(false);
  const [quota, setQuota] = useState(null);
  const [resetAt, setResetAt] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // Fresh snapshot each time the panel opens (service caches ~5 min).
  useEffect(() => {
    if (!open) return;
    setMessages([{ id: "welcome", role: "assistant", content: WELCOME }]);
    setInput("");
    setLoading(false);
    setCapped(false);
    setQuota(null);
    setResetAt(null);
    let cancelled = false;
    setContextReady(false);
    buildAdminContext()
      .then(() => {
        if (cancelled) return;
        setContextReady(true);
      })
      .catch((e) => {
        console.error("AdminAssistantWidget: failed to build context", e);
        if (!cancelled) setContextReady(true); // still allow chatting; worker will fail gracefully
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  const appendUserAndReply = useCallback(
    async (text, isRegenerate = false) => {
      const trimmed = text.trim();
      if (!trimmed || loading || !contextReady || capped) return;

      const historyForApi = messages
        .filter((m) => m.id !== "welcome")
        .slice(-8)
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));

      if (isRegenerate) {
        setMessages((prev) => {
          const withoutLastAssistant = prev.filter(
            (m) => !(m.role === "assistant" && m.id !== "welcome"));
          return [...withoutLastAssistant];
        });
      } else {
        setMessages((prev) => [
          ...prev,
          { id: `u-${Date.now()}`, role: "user", content: trimmed.slice(0, 400) },
        ]);
        setInput("");
      }

      setLoading(true);

      try {
        const context = await buildAdminContext();
        const result = await sendAdminChat([...historyForApi, { role: "user", content: trimmed }], context);
        if (Number.isFinite(result?.remainingToday) && Number.isFinite(result?.dailyLimit)) {
          setQuota({ remainingToday: result.remainingToday, dailyLimit: result.dailyLimit });
        }
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", content: result?.content || "(Empty response.)" },
        ]);
      } catch (e) {
        if (e?.code === "DAILY_CAP") {
          // The greyed composer + capped card already say it; no extra bubble.
          setCapped(true);
          setResetAt(typeof e.resetAt === "string" ? e.resetAt : null);
        } else {
          let msg = e?.message || "The assistant is unreachable right now.";
          if (e?.code === "AUTH_REQUIRED") {
            msg = `${msg} If this persists, reload the page to refresh your session.`;
          }
          setMessages((prev) => [
            ...prev,
            {
              id: `e-${Date.now()}`,
              role: "assistant",
              content: msg,
              isError: true},
          ]);
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, contextReady, capped]);

  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) appendUserAndReply(lastUserMsg.content, true);
  }, [messages, appendUserAndReply]);

  const onSubmit = (e) => {
    e.preventDefault();
    appendUserAndReply(input);
  };

  const isOnlyWelcome = messages.length === 1 && messages[0].id === "welcome";
  const resetLabel = formatResetTime(resetAt);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex flex-col items-end">
      {/* Panel */}
      <div
        className={`pointer-events-auto mb-3 origin-bottom-right transition-all duration-300 ease-out ${
          open
            ? "scale-100 opacity-100 translate-y-0 visible"
            : "scale-95 opacity-0 translate-y-2 pointer-events-none invisible"
        }`}
      >
        <div className="flex w-[380px] max-w-[calc(100vw-2rem)] max-h-[min(500px,calc(100vh-160px))] flex-col overflow-hidden rounded-2xl border border-border/60 bg-white shadow-[0_1px_2px_rgba(28,28,30,0.04),0_12px_32px_rgba(28,28,30,0.12)]">

          {/* Header — guest chatbox shape, admin identity */}
          <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-5 py-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-playfair text-sm font-semibold leading-tight text-foreground">
                Ops Assistant
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-none text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Live operations, accounts, alerts, refunds
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
              <EmptyState contextReady={contextReady} />
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
                      <div
                        className={`w-full max-w-[92%] text-sm ${
                          m.isError ? "rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-destructive" : "text-foreground"
                        }`}
                      >
                        <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {m.content}
                        </Markdown>
                      </div>
                      {!m.isError && m.id !== "welcome" && (
                        <div className="absolute -right-1 -top-1">
                          <ActionBar content={m.content} onRegenerate={handleRegenerate} />
                        </div>
                      )}
                    </div>
                  );
                })}

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
                <p className="text-sm font-medium text-foreground">Daily assistant limit reached</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {resetLabel ? `Resets at ${resetLabel}.` : "Resets tomorrow."}
                </p>
              </div>
            </div>
          ) : (
            <div className="shrink-0 bg-white p-3">
              <form onSubmit={onSubmit}>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1 transition-all focus-within:ring-[3px] focus-within:ring-ring/50">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value.slice(0, 400))}
                    placeholder="Ask about revenue, bookings, rooms…"
                    disabled={loading || !contextReady}
                    maxLength={400}
                    className="h-10 flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={loading || !contextReady || !input.trim()}
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
      <div className="pointer-events-auto" title="Open Ops Assistant">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="group flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_20px_rgba(28,28,30,0.18)] transition-all duration-200 hover:scale-105 hover:shadow-[0_8px_28px_rgba(28,28,30,0.22)] active:scale-95"
          aria-label={open ? "Close Ops Assistant" : "Open Ops Assistant"}
        >
          {open ? (
            <X className="h-5 w-5 transition-transform duration-200" />
          ) : (
            <Bot className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />
          )}
        </button>
      </div>
    </div>
  );
}
