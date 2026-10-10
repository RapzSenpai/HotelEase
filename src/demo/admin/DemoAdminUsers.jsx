import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import DemoSectionHeader from "../DemoSectionHeader";
import { useDemo } from "../DemoContext";

const ROLES = ["guest", "fo", "admin"];

export default function DemoAdminUsers() {
  const { data, admin } = useDemo();

  function setUserRole(user, role) {
    if (role === user.role) return;
    admin.demoSetUserRole({ userId: user.id, role });
    toast.success(`Demo: ${user.fullName} is now ${role} (in-memory only).`);
  }

  return (
    <div className="space-y-4">
      <DemoSectionHeader
        label="User Management"
        role="admin"
        description="Sample accounts. Switching a role only changes this page's state — no real account is touched."
      />
      <div className="space-y-2">
        {data.users.map((user) => (
          <Card key={user.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <div className="text-sm font-medium">{user.fullName}</div>
              <div className="text-xs text-foreground/60">{user.email}</div>
            </div>
            <div className="flex gap-1.5">
              {ROLES.map((role) => (
                <Button
                  key={role}
                  variant={user.role === role ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  aria-pressed={user.role === role}
                  onClick={() => setUserRole(user, role)}
                >
                  {role}
                </Button>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-foreground/50">
        The real screen also supports disabling, force sign-out, and account deletion — all disabled in the demo.
      </p>
    </div>
  );
}
