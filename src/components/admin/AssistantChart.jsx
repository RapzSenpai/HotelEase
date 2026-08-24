import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const CHART_TYPES = ["bar", "line", "pie", "area"];
const MAX_POINTS = 31;
const MAX_PIE_SLICES = 6;
const PALETTE = ["#D4AF37", "#1A1A1A", "#4A4A4A", "#8E8E8E", "#B99000", "#C9C9C2"];

const TOOLTIP_STYLE = {
  borderRadius: "12px",
  border: "none",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
};

/**
 * Parse + strictly validate an assistant-emitted ```chart spec.
 * Returns { ok: true, spec } or { ok: false, error }.
 */
function parseChartSpec(raw) {
  let text = String(raw ?? "").trim();
  if (!text) return { ok: false, error: "Empty chart block." };

  // Tolerate stray prose around the JSON object.
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    return { ok: false, error: "No chart JSON found." };
  }
  text = text.slice(firstBrace, lastBrace + 1);

  // LLMs love trailing commas ("[{...},]") — strip them before parsing.
  text = text.replace(/,\s*([}\]])/g, "$1");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Invalid chart JSON." };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "Chart spec must be an object." };
  }

  const type = String(parsed.type ?? "").toLowerCase();
  if (!CHART_TYPES.includes(type)) {
    return { ok: false, error: `Unsupported chart type "${parsed.type}".` };
  }

  const rawPoints = Array.isArray(parsed.data) ? parsed.data : [];
  const points = [];
  for (const p of rawPoints.slice(0, MAX_POINTS)) {
    if (typeof p !== "object" || p === null) continue;
    const value = Number(p.value);
    if (!Number.isFinite(value)) continue;
    points.push({ label: String(p.label ?? "").slice(0, 40), value });
  }
  if (points.length < 2) {
    return { ok: false, error: "Chart needs at least 2 valid data points." };
  }

  return {
    ok: true,
    spec: {
      type,
      title: String(parsed.title ?? "").slice(0, 80),
      xLabel: typeof parsed.xLabel === "string" ? parsed.xLabel.slice(0, 40) : "",
      yLabel: typeof parsed.yLabel === "string" ? parsed.yLabel.slice(0, 40) : "",
      data: type === "pie" ? points.slice(0, MAX_PIE_SLICES) : points,
    },
  };
}

function ChartFrame({ spec, children }) {
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-white">
      {spec.title ? (
        <div className="border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
          {spec.title}
        </div>
      ) : null}
      <div className="h-[220px] w-full p-2">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function AssistantChart({ code }) {
  const result = useMemo(() => parseChartSpec(code), [code]);

  if (!result.ok) {
    return (
      <div className="my-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Chart unavailable — {result.error}
      </div>
    );
  }

  const { spec } = result;
  const axisTick = { fontSize: 11, fill: "#888" };

  if (spec.type === "bar") {
    return (
      <ChartFrame spec={spec}>
        <BarChart data={spec.data} margin={{ top: 8, right: 12, bottom: 4, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} interval="preserveStartEnd" />
          <YAxis axisLine={false} tickLine={false} tick={axisTick} />
          <Tooltip cursor={{ fill: "#F5F5F5" }} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" name={spec.yLabel || "Value"} fill="#D4AF37" radius={[6, 6, 0, 0]} maxBarSize={42} />
        </BarChart>
      </ChartFrame>
    );
  }

  if (spec.type === "line") {
    return (
      <ChartFrame spec={spec}>
        <LineChart data={spec.data} margin={{ top: 8, right: 12, bottom: 4, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} interval="preserveStartEnd" />
          <YAxis axisLine={false} tickLine={false} tick={axisTick} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Line type="monotone" dataKey="value" name={spec.yLabel || "Value"} stroke="#D4AF37" strokeWidth={2.5} dot={{ r: 3, fill: "#D4AF37" }} activeDot={{ r: 5 }} />
        </LineChart>
      </ChartFrame>
    );
  }

  if (spec.type === "area") {
    return (
      <ChartFrame spec={spec}>
        <AreaChart data={spec.data} margin={{ top: 8, right: 12, bottom: 4, left: -10 }}>
          <defs>
            <linearGradient id="assistantAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#D4AF37" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} interval="preserveStartEnd" />
          <YAxis axisLine={false} tickLine={false} tick={axisTick} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Area type="monotone" dataKey="value" name={spec.yLabel || "Value"} stroke="#D4AF37" strokeWidth={2} fill="url(#assistantAreaFill)" />
        </AreaChart>
      </ChartFrame>
    );
  }

  // pie
  return (
    <ChartFrame spec={spec}>
      <PieChart>
        <Pie data={spec.data} dataKey="value" nameKey="label" cx="50%" cy="45%" innerRadius={45} outerRadius={70} paddingAngle={4}>
          {spec.data.map((entry, index) => (
            <Cell key={`slice-${index}`} fill={PALETTE[index % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ChartFrame>
  );
}
