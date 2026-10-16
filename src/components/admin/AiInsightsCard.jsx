import { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildAdminContext, generateAiInsights } from "@/services/insightsService";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChartLine, Copy, Check, RefreshCw, AlertTriangle } from "lucide-react";

const markdownComponents = {
  p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="list-inside list-disc space-y-1 pl-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-inside list-decimal space-y-1 pl-1">{children}</ol>,
  li: ({ children }) => <li className="text-sm">{children}</li>,
  h2: ({ children }) => (
    <h2 className="mt-4 mb-1.5 flex items-center gap-2 text-sm font-bold first:mt-0">
      <span className="h-3 w-1 rounded-full bg-primary" />
      {children}
    </h2>
  ),
  h3: ({ children }) => <h3 className="mt-3 mb-1 text-sm font-semibold">{children}</h3>,
  hr: () => <hr className="my-3 border-border" />};

/** Human-readable snapshot timestamp for the card's data-provenance line. */
function formatStamp(iso) {
  if (!iso) return "just now";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "just now"
    : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function AiInsightsCard() {
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [dataAsOf, setDataAsOf] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status !== "ready") return undefined;
    return () => setCopied(false);
  }, [status]);

  const generate = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const context = await buildAdminContext();
      const content = await generateAiInsights(context);
      if (!content) throw new Error("The analyst returned an empty response.");
      setReport(content);
      setDataAsOf({
        at: context?.generatedAt ?? null,
        from: context?.period?.current?.from ?? null,
        to: context?.period?.current?.to ?? null});
      setStatus("ready");
    } catch (e) {
      setError(e?.message || "Failed to generate insights.");
      setStatus("error");
    }
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-primary/10 text-primary">
            <ChartLine className="h-4 w-4" />
          </div>
          AI Insights
        </CardTitle>
        {status === "ready" ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={generate}>
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {status === "idle" ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ChartLine className="h-5 w-5 text-primary" />
            </div>
            <div className="max-w-md space-y-1">
              <p className="text-sm font-medium">Let AI analyze your hotel data</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Generates a summary, key trends, anomalies with explanations, and improvement
                opportunities from the last 60 days of bookings, revenue, reviews, operations,
                accounts, alerts, refunds, and system health.
              </p>
            </div>
            <Button onClick={generate} size="sm" className="mt-1">
              <ChartLine className="h-4 w-4" />
              Generate Insights
            </Button>
          </div>
        ) : null}

        {status === "loading" ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing hotel performance…</p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <p className="max-w-md text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={generate}>
              Try Again
            </Button>
          </div>
        ) : null}

        {status === "ready" ? (
          <div className="space-y-1 rounded-xl border border-border bg-muted/10 p-4">
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {report}
            </Markdown>
            <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
              Analysed snapshot from {formatStamp(dataAsOf?.at)}
              {dataAsOf?.from && dataAsOf?.to ? ` · window ${dataAsOf.from} to ${dataAsOf.to}` : ""}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
