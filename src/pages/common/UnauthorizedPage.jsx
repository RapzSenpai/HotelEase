import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";

export default function UnauthorizedPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-border bg-background p-6">
      <h1 className="font-playfair text-3xl font-semibold">Unauthorized</h1>
      <p className="text-foreground/80">
        Your account role doesn’t have access to this page yet.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <NavLink to="/">Go to Landing</NavLink>
        </Button>
        <Button asChild variant="ghost">
          <NavLink to="/rooms">Browse Rooms</NavLink>
        </Button>
      </div>
    </div>
  );
}

