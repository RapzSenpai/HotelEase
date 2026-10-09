import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  { id: "guest", label: "Guest", hint: "Browse, book, review, housekeeping", to: "/demo/guest" },
  { id: "fo", label: "Front Office", hint: "Dashboard, bookings, payments", to: "/demo/fo" },
  { id: "admin", label: "Admin", hint: "Rooms, users, analytics", to: "/demo/admin" },
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
  function pick(role) {
    onOpenChange(false);
    onPick(role);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Try the Demo</DialogTitle>
          <DialogDescription>
            A simulated tour with sample data — nothing is saved and no real
            booking is created. Which role do you want to experience?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {ROLES.map((role) => (
            <Button
              key={role.id}
              variant="outline"
              className="h-auto w-full justify-start gap-3 px-4 py-3 text-left"
              onClick={() => pick(role)}
            >
              <span className="font-semibold">{role.label}</span>
              <span className="text-xs text-foreground/60">{role.hint}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
