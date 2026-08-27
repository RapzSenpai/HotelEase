import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, X, Copy, Check, ArrowUp, RotateCcw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { buildAdminContext, sendAdminChat } from "@/services/insightsService";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AssistantChart from "@/components/admin/AssistantChart";

const QUICK_PROMPTS = [
  { label: "Summarize this month", prompt: "Summarize hotel performance for the current period." },
  { label: "Top earning rooms?", prompt: "Which rooms are earning the most?" },
  { label: "Any red flags?", prompt: "Are there any potential issues I should look into?" },
  { label: "Chart revenue trend", prompt: "Show me a chart of the daily revenue trend." },
];

const WELCOME =
  "Ops Assistant online. I can see aggregated booking, revenue, room, review, and operations data for the last 60 days. Ask me anything — or request a chart.";

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
  pre: ({ children }) => <>{children}</>,
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

function EmptyState({ contextReady }) {
  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-4 text-center">
      <div className="mt-auto" />
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Bot className="h-5 w-5 text-primary" />
      </div>
      <p className="mb-auto text-sm font-medium text-foreground">
        {contextReady ? "What would you like to know?" : "Loading hotel data…"}
      </p>
    </div>
  );
}

export default function AdminAssistantWidget() {
  const { trainingMode } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextReady, setContextReady] = useState(true);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // Fresh snapshot each time the panel opens (service caches ~5 min).
  useEffect(() => {
    if (!open) return;
    setMessages([{ id: "welcome", role: "assistant", content: WELCOME }]);
    setInput("");
    setLoading(false);
    let cancelled = false;
    setContextReady(false);
    buildAdminContext({ trainingMode })
      .then(() => {
        if (!cancelled) setContextReady(true);
      })
      .catch((e) => {
        console.error("AdminAssistantWidget: failed to build context", e);
        if (!cancelled) setContextReady(true); // still allow chatting; worker will fail gracefully
      });
    return () => {
      cancelled = true;
    };
  }, [open, trainingMode]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  const appendUserAndReply = useCallback(
    async (text, isRegenerate = false) => {
      const trimmed = text.trim();
      if (!trimmed || loading || !contextReady) return;

      const historyForApi = messages
        .filter((m) => m.id !== "welcome")
        .slice(-8)
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));

      if (isRegenerate) {
        setMessages((prev) => {
          const withoutLastAssistant = prev.filter(
            (m) => !(m.role === "assistant" && m.id !== "welcome"),
          );
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
        const context = await buildAdminContext({ trainingMode });
        const reply = await sendAdminChat([...historyForApi, { role: "user", content: trimmed }], context);
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", content: reply || "(Empty response.)" },
        ]);
      } catch (e) {
        let msg = e?.message || "The assistant is unreachable right now.";
        if (e?.code === "AUTH_REQUIRED" || e?.code === "DAILY_CAP") {
          msg = `${e.message} If this persists, reload the page to refresh your session.`;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            content: msg,
            isError: true,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, trainingMode, contextReady],
  );

  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) appendUserAndReply(lastUserMsg.content, true);
  }, [messages, appendUserAndReply]);

  const onSubmit = (e) => {
    e.preventDefault();
    appendUserAndReply(input);
  };

  const isOnlyWelcome = messages.length === 1 && messages[0].id === "welcome";

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
        <div className="flex w-[380px] max-w-[calc(100vw-2rem)] max-h-[min(500px,calc(100vh-160px))] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08)]">

          {/* Messages */}
          <div ref={listRef} className={`min-h-0 flex-1 overflow-y-auto${isOnlyWelcome ? " flex flex-col" : ""}`}>
            {isOnlyWelcome ? (
              <EmptyState contextReady={contextReady} />
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

          {/* Composer */}
          <div className="shrink-0 bg-white p-2.5">
            {isOnlyWelcome && (
              <div className="flex flex-wrap justify-center gap-2 pb-2 pt-3">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    disabled={loading || !contextReady}
                    onClick={() => appendUserAndReply(q.prompt)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={onSubmit}>
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-1 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, 400))}
                  placeholder="Ask about revenue, bookings, rooms…"
                  disabled={loading || !contextReady}
                  maxLength={400}
                  className="h-9 flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
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
        </div>
      </div>

      {/* FAB */}
      <div className="pointer-events-auto" title="Open Ops Assistant">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="group flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105 active:scale-95"
          style={{ background: "#F5C518" }}
          aria-label={open ? "Close Ops Assistant" : "Open Ops Assistant"}
        >
          {open ? (
            <X className="h-5 w-5 transition-transform duration-200" style={{ color: "#1C1C1E" }} />
          ) : (
            <Bot className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" style={{ color: "#1C1C1E" }} />
          )}
        </button>
      </div>
    </div>
  );
}
