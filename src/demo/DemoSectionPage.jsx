import { Card } from "@/components/ui/card";

// ponytail: fallback shell, unreachable today — every nav item has a real page in
// src/demo/routes.js. It exists so a nav item added in production still routes to
// something explainable in the demo instead of a blank screen.
export default function DemoSectionPage({ label, role }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">
          {role === "admin" ? "Administrator" : "Front Office"} · Try Demo
        </p>
        <h1 className="font-playfair text-3xl font-semibold">{label}</h1>
        <p className="text-sm text-foreground/70">
          This is the real {label} screen shape — the sample data view is being wired up next.
        </p>
      </div>
      <Card className="p-5">
        <p className="text-sm text-foreground/60">
          Navigation, labelling, and layout come from the live app. Actions here will be simulated and
          never touch real data.
        </p>
      </Card>
    </div>
  );
}
