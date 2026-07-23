import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

const SUCCESS_MESSAGE =
  "If an account exists for that email address, a password reset link has been sent. Please check your inbox.";

const COOLDOWN_SECONDS = 60;

function getErrorMessage(err) {
  const code = err?.code || "";
  if (code === "auth/user-not-found" || code === "auth/invalid-email") {
    return "Please enter a valid email address.";
  }
  return "Something went wrong. Please try again.";
}

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);

    if (cooldown > 0) {
      setError(`Please wait ${cooldown} seconds before trying again.`);
      return;
    }

    try {
      setLoading(true);
      await forgotPassword({ email });
      setSuccess(true);
      setCooldown(COOLDOWN_SECONDS);
      const interval = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-4">
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">Reset Your Password</h1>
        <p className="text-sm text-foreground/70">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
        {success ? (
          <div className="space-y-6 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-success" />
            <p className="text-sm text-foreground font-inter">{SUCCESS_MESSAGE}</p>
            <Link
              to="/login"
              className="inline-block text-sm text-primary underline underline-offset-4 hover:text-primary/80 transition-colors font-inter"
            >
              Back to Login
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
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

            <Button
              type="submit"
              variant="default"
              className="w-full"
              disabled={loading || cooldown > 0}
            >
              {cooldown > 0
                ? `Resend in ${cooldown}s`
                : loading
                ? "Sending..."
                : "Send Reset Link"}
            </Button>

            {error ? (
              <p className="text-sm text-destructive font-inter text-center">{error}</p>
            ) : null}

            <div className="text-center pt-1">
              <Link
                to="/login"
                className="text-sm text-primary underline underline-offset-4 hover:text-primary/80 transition-colors font-inter"
              >
                Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
