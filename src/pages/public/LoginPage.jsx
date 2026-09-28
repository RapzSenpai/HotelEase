import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RequiredIndicator from "@/components/common/RequiredIndicator";
import { useAuth } from "@/contexts/AuthContext";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Select } from "radix-ui";
import { mapAuthError } from "@/lib/authErrors";
import { useLoginLockout } from "@/hooks/useLoginLockout";
import { toast } from "sonner";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, signInWithTrainingCode, loading, role } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showTraining, setShowTraining] = useState(false);

  // Brute-force protection (persists across refresh via sessionStorage)
  const {
    failedAttempts,
    isLocked,
    remainingSeconds,
    maxAttempts,
    lockSeconds,
    registerFailure,
    resetAttempts,
  } = useLoginLockout();

  const [trainingCode, setTrainingCode] = useState("");
  const [trainingRole, setTrainingRole] = useState("guest");
  const [trainingSubmitting, setTrainingSubmitting] = useState(false);

  // Firebase returns invalid-credential for both bad passwords and unknown
  // emails (enumeration protection); treat all three codes identically so
  // the UI never signals which one happened.
  function isCredentialError(err) {
    const code = err?.code || "";
    if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"].includes(code)) {
      return true;
    }
    const match = String(err?.message || "").match(/auth\/([a-zA-Z0-9_-]+)/);
    return ["invalid-credential", "user-not-found", "wrong-password"].includes(match?.[1]);
  }

  async function onSubmit(e) {
    e.preventDefault();

    if (isLocked) {
      toast.error("Too many failed attempts", {
        description: `Please wait ${remainingSeconds}s before trying again.`,
      });
      return;
    }

    try {
      await login({ email, password });
      resetAttempts();
      if (role === "fo") navigate("/fo");
      else if (role === "admin") navigate("/admin");
      else navigate("/my-bookings");
    } catch (err) {
      const justLocked = registerFailure();
      if (justLocked) {
        toast.error("Too many failed attempts", {
          description: `Account locked for ${lockSeconds} seconds.`,
        });
      } else if (isCredentialError(err)) {
        // Wrong email, wrong password, or no account: one generic message,
        // no attempt countdown (a countdown on a nonexistent account leaks
        // that the account doesn't exist and reads as a bug).
        toast.error("The email or password you entered is incorrect.");
      } else {
        const message = mapAuthError(err) || "Login failed.";
        const remaining = maxAttempts - (failedAttempts + 1);
        toast.error(message, {
          description: `${remaining} attempt${remaining !== 1 ? "s" : ""} remaining before lockout.`,
        });
      }
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">Welcome Back</h1>
        <p className="text-foreground/80">We're glad to see you again. Please log in to your account.</p>
      </div>

      <form className="space-y-4 rounded-xl border border-border bg-background p-6 shadow-sm" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email Address<RequiredIndicator /></Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password">Password<RequiredIndicator /></Label>
            <Link
              to="/forgot-password"
              className="text-xs text-foreground/55 hover-surface-text shrink-0"
            >
              Forgot Password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-foreground/40 hover:text-foreground/70"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Button type="submit" size="default" className="w-full" disabled={loading || isLocked}>
          {isLocked ? `Locked — ${remainingSeconds}s` : loading ? "Signing in..." : "Login"}
        </Button>

        <div className="text-center text-sm text-foreground/70">
          No account yet?{" "}
          <NavLink
            to="/register"
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
          >
            Register
          </NavLink>
        </div>

        <div className="pt-2 border-t border-border">
          {!showTraining ? (
            <div className="text-center">
              <Button
                variant="link"
                size="sm"
                type="button"
                onClick={() => setShowTraining(true)}
                className="text-xs text-foreground/50 hover-surface-text h-auto p-0"
              >
                Join Training Session
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Training Session Access</span>
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  onClick={() => setShowTraining(false)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  Cancel
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trainingCode">Training Code</Label>
                <Input
                  id="trainingCode"
                  value={trainingCode}
                  onChange={(e) => setTrainingCode(e.target.value)}
                  placeholder="Enter code from Admin"
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trainingRole">Session Role</Label>
                <Select.Root
                  value={trainingRole}
                  onValueChange={(value) => setTrainingRole(value)}
                  disabled={trainingSubmitting}
                >
                  <Select.Trigger
                    id="trainingRole"
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content position="popper" side="bottom" align="start" sideOffset={4} className="z-50 max-h-64 min-w-[8rem] overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                      <Select.Viewport>
                        <Select.Item
                          value="guest"
                          className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:bg-primary/15 data-[highlighted]:text-foreground"
                        >
                          <Select.ItemText>Guest</Select.ItemText>
                        </Select.Item>
                        <Select.Item
                          value="fo"
                          className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:bg-primary/15 data-[highlighted]:text-foreground"
                        >
                          <Select.ItemText>Front Office</Select.ItemText>
                        </Select.Item>
                        <Select.Item
                          value="admin"
                          className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:bg-primary/15 data-[highlighted]:text-foreground"
                        >
                          <Select.ItemText>System Admin</Select.ItemText>
                        </Select.Item>
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>

              <Button
                type="button"
                variant="default"
                size="default"
                className="w-full"
                disabled={trainingSubmitting || !trainingCode || !trainingRole}
                onClick={async () => {
                  setTrainingSubmitting(true);
                  try {
                    await signInWithTrainingCode({
                      code: trainingCode,
                      role: trainingRole,
                    });
                    if (trainingRole === "fo") navigate("/fo");
                    else if (trainingRole === "admin") navigate("/admin");
                    else navigate("/my-bookings");
                  } catch (err) {
                    toast.error(mapAuthError(err) || "Training login failed.");
                  } finally {
                    setTrainingSubmitting(false);
                  }
                }}
              >
                {trainingSubmitting ? "Joining..." : "Join Session"}
              </Button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

