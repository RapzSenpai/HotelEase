import { useAuth } from "@/contexts/AuthContext";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { User, Mail, Shield, CalendarDays } from "lucide-react";

export default function ProfilePage() {
  const { user, role, profile } = useAuth();

  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="font-playfair text-3xl font-semibold">Profile</h1>
        <div className="rounded-xl border border-border bg-background p-8 text-center space-y-4">
          <p className="text-foreground/60 text-sm">You are not logged in.</p>
          <Button asChild variant="default" size="sm">
            <NavLink to="/login">Sign In</NavLink>
          </Button>
        </div>
      </div>
    );
  }

  const infoRows = [
    {
      icon: Mail,
      label: "Email",
      value: user.email || "—",
    },
    {
      icon: Shield,
      label: "Role",
      value: role ? role.charAt(0).toUpperCase() + role.slice(1) : "Guest",
    },
    {
      icon: User,
      label: "User ID",
      value: user.uid,
      mono: true,
    },
    {
      icon: CalendarDays,
      label: "Account Created",
      value: user.metadata?.creationTime
        ? new Date(user.metadata.creationTime).toLocaleDateString("en-PH", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "—",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">My Profile</h1>
        <p className="text-foreground/60 text-sm">
          Your account information and preferences.
        </p>
      </div>

      {/* Avatar + name card */}
      <div className="rounded-xl border border-border bg-background p-6 flex items-center gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/20 border-2 border-primary/30">
          <User className="h-8 w-8 text-primary" />
        </div>
        <div>
          <p className="font-playfair text-xl font-semibold">
            {profile?.fullName || user.displayName || user.email?.split("@")[0] || "Guest"}
          </p>
          <p className="text-sm text-foreground/55 mt-0.5">{user.email || "—"}</p>
          <span className="mt-1.5 inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {role ? role.charAt(0).toUpperCase() + role.slice(1) : "Guest"}
          </span>
        </div>
      </div>

      {/* Info grid */}
      <div className="rounded-xl border border-border bg-background divide-y divide-border">
        {infoRows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="flex items-center gap-4 px-5 py-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/20">
                <Icon className="h-4 w-4 text-foreground/50" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-foreground/45">
                  {row.label}
                </p>
                <p
                  className={`mt-0.5 text-sm text-foreground ${
                    row.mono ? "font-mono text-xs text-foreground/60 truncate" : ""
                  }`}
                >
                  {row.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="default" size="sm">
          <NavLink to="/my-bookings">My Bookings</NavLink>
        </Button>
        <Button asChild variant="outline" size="sm">
          <NavLink to="/rooms">Browse Rooms</NavLink>
        </Button>
      </div>
    </div>
  );
}
