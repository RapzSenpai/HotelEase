import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-border bg-background p-6">
      <h1 className="font-playfair text-3xl font-semibold">Page Not Found</h1>
      <p className="text-foreground/80">The page you requested doesn’t exist.</p>
      <Button asChild variant="default">
        <NavLink to="/">Back to Landing</NavLink>
      </Button>
    </div>
  );
}

