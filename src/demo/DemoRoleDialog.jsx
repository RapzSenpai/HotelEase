import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ConciergeBell, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDemo } from "./DemoContext";

const ROLES = [
  { id: "fo", label: "Front Office", hint: "Dashboard, bookings, payments", to: "/demo/fo", icon: ConciergeBell },
  { id: "admin", label: "Admin", hint: "Rooms, users, analytics", to: "/demo/admin", icon: ShieldCheck },
];

// /demo index: same picker, wired to the route provider. Closing without
// a role returns home instead of stranding on an empty shell.
export function DemoIndex() {
  const navigate = useNavigate();
  const { setRole } = useDemo();
  const [open, setOpen] = useState(true);
  return (
    <DemoRoleDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) navigate("/");
      }}
      onPick={(role) => {
        setRole(role.id);
        navigate(role.to);
      }}
    />
  );
}
export default function DemoRoleDialog({ open, onOpenChange, onPick }) {
  // The caller owns navigation: closing here as well raced the route change and
  // left the picker mounted on the page the visitor was supposed to leave.
  function pick(role) {
    onPick(role);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mobile: 1rem side margins + viewport-bounded scroll; sm+ keeps the desktop look. */}
      <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Try the demo</DialogTitle>
          <DialogDescription>
            Look around with sample data. Nothing gets saved or booked for real. Pick a
            role to start.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {ROLES.map((role) => (
            <Button
              key={role.id}
              variant="default"
              className="h-auto w-full items-center gap-3 rounded-xl px-4 py-3 text-left shadow-[0_2px_10px_rgba(28,28,30,0.15)] hover:bg-primary/90"
              onClick={() => pick(role)}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/10">
                <role.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className="font-semibold">{role.label}</span>
                <span className="text-xs text-primary-foreground/70">{role.hint}</span>
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-primary-foreground/60"
                aria-hidden="true"
              />
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
