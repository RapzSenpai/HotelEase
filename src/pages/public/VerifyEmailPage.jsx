import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { getHomePathForRole } from "@/lib/routing";
import { MailCheck, AlertTriangle, RefreshCw, ShieldCheck, LogOut } from "lucide-react";

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const { user, profile, sendVerificationCode, verifyEmailWithCode, logout } =
    useAuth();

  const [code, setCode] = useState("");
  const [status, setStatus] = useState(null); // { type: 'error' | 'success', message }
  const [sending, setSending] = useState(true); // auto-send the code on mount
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // React StrictMode mounts effects twice in dev — without this guard the
  // "auto-send on mount" effect would email the OTP twice.
  const autoSendRef = useRef(false);

  useEffect(() => {
    // React StrictMode mounts the effect twice in dev: mount #1 starts the
    // send, then gets cleaned up (cancelled=true), then mount #2 sees
    // autoSendRef.current === true and returns early. Mount #1's async send
    // is the only one that ever completes, so its state updates MUST NOT be
    // dropped by the cancelled flag — otherwise `sending` stays true forever.
    if (!user?.uid) return;
    if (autoSendRef.current) return;
    autoSendRef.current = true;
    (async () => {
      try {
        const result = await sendVerificationCode();
        if (!result.ok) {
          setStatus({ type: "error", message: result.reason });
        } else {
          setCooldown(60);
        }
      } catch (e) {
        setStatus({
          type: "error",
          message: e?.message || "Failed to send the code.",
        });
      } finally {
        setSending(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function onResend() {
    if (sending || cooldown > 0) return;
    setStatus(null);
    setSending(true);
    try {
      const result = await sendVerificationCode();
      if (!result.ok) {
        setStatus({ type: "error", message: result.reason });
      } else {
        setStatus({ type: "success", message: "A new code was sent." });
        setCooldown(60);
      }
    } catch (e) {
      setStatus({
        type: "error",
        message: e?.message || "Failed to resend the code.",
      });
    } finally {
      setSending(false);
    }
  }

  async function onVerify(e) {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setStatus({ type: "error", message: "Enter the 6-digit code." });
      return;
    }
    setVerifying(true);
    setStatus(null);
    try {
      const result = await verifyEmailWithCode(trimmed);
      if (result.ok) {
        setStatus({
          type: "success",
          message: "Email verified! Redirecting to your dashboard…",
        });
        setTimeout(
          () => navigate(getHomePathForRole("guest"), { replace: true }),
          1200,
        );
      } else {
        setStatus({ type: "error", message: result.reason });
      }
    } catch (e) {
      setStatus({
        type: "error",
        message: e?.message || "Verification failed.",
      });
    } finally {
      setVerifying(false);
    }
  }

  async function onSignOut() {
    try {
      await logout();
      navigate("/", { replace: true });
    } catch {
      // ignore
    }
  }

  // Already verified (reached this page directly) — allow continuing.
  if (profile?.emailVerified) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <div className="space-y-1">
          <h1 className="font-playfair text-3xl font-semibold">Email Verified</h1>
          <p className="text-foreground/80">
            Your email is already verified. You're good to go.
          </p>
        </div>
        <div className="space-y-4 rounded-xl border border-success/30 bg-success/5 p-6 text-center">
          <div className="flex justify-center">
            <ShieldCheck className="h-12 w-12 text-success" />
          </div>
          <p className="text-sm text-foreground/70">You can now use your account normally.</p>
          <Button
            variant="default"
            className="w-full"
            onClick={() => navigate(getHomePathForRole("guest"), { replace: true })}
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">Verify Your Email</h1>
        <p className="text-foreground/80">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-foreground">
            {user?.email || "your email"}
          </span>
          . Enter it below to continue.
        </p>
      </div>

      <form
        onSubmit={onVerify}
        className="space-y-4 rounded-xl border border-border bg-background p-6 shadow-sm"
      >
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
          <MailCheck className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <span>
            {sending
              ? "Sending your verification code…"
              : "A code has been sent. Please check your inbox (and spam folder)."}
          </span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="otp">Verification Code</Label>
          <Input
            id="otp"
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="h-12 text-center text-2xl tracking-[0.3em]"
            autoFocus
            disabled={verifying}
          />
        </div>

        {status ? (
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm text-foreground ${
              status.type === "error"
                ? "border-destructive/30 bg-destructive/10"
                : "border-success/30 bg-success/5"
            }`}
          >
            {status.type === "error" ? (
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
            ) : (
              <MailCheck className="h-4 w-4 shrink-0 mt-0.5 text-success" />
            )}
            <span>{status.message}</span>
          </div>
        ) : null}

        <Button
          type="submit"
          variant="default"
          className="w-full"
          disabled={verifying || code.length !== 6}
        >
          {verifying ? "Verifying…" : "Verify Email"}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResend}
            disabled={sending || cooldown > 0}
            className="gap-2 text-foreground/70"
          >
            <RefreshCw className="h-4 w-4" />
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSignOut}
            className="gap-2 text-foreground/50 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </form>
    </div>
  );
}