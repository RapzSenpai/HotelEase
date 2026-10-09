import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";

// Tier A demo chrome: slim read-only strip over real public pages.
// Zero services/firebase imports by construction (see demo-isolation test).
export default function DemoPreviewStrip() {
  const [params] = useSearchParams();
  if (params.get("demo") !== "1") return null;
  return (
    <div className="border-b border-border bg-muted/40 px-5 py-2 text-center text-xs text-foreground/70 md:px-8">
      Demo preview — booking needs an account.{" "}
      <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
        <Link to="/demo/guest">Back to simulated demo</Link>
      </Button>
    </div>
  );
}
