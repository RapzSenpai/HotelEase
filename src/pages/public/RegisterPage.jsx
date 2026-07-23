import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RequiredIndicator from "@/components/common/RequiredIndicator";
import { useAuth } from "@/contexts/AuthContext";
import { NavLink, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, authError, loading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [honeypot, setHoneypot] = useState("");
  const [cooldown, setCooldown] = useState(false);

  function validatePassword(pw) {
    if (pw.length < 8) return "Password must be at least 8 characters.";
    if (!/\d/.test(pw)) return "Password must contain at least one number.";
    if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter.";
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw)) return "Password must contain at least one special character.";
    return null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setLocalError(null);

    // Honeypot check — bots fill hidden fields
    if (honeypot) return;

    // Rate limit — cooldown after previous registration
    if (cooldown) {
      setLocalError("Please wait a moment before creating another account.");
      return;
    }

    const pwError = validatePassword(password);
    if (pwError) {
      setPasswordError(pwError);
      return;
    }
    setPasswordError(null);

    try {
      await register({ email, password, fullName });
      setCooldown(true);
      setTimeout(() => setCooldown(false), 60000);
      toast.success("Account created! Please log in.");
      navigate("/login");
    } catch (err) {
      setLocalError(err?.message || "Registration failed.");
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">Join HotelEase</h1>
        <p className="text-sm text-foreground/70">
          Create your account to start booking your luxury stay today.
        </p>
      </div>

      <form className="space-y-4 rounded-xl border border-border bg-background p-6 shadow-sm" onSubmit={onSubmit}>
        {/* Honeypot — hidden from humans, bots will fill it */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0, width: 0 }}
        />

        <div className="space-y-2">
          <Label htmlFor="fullName">Full Name<RequiredIndicator /></Label>
          <Input
            id="fullName"
            required
            placeholder="Enter your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email<RequiredIndicator /></Label>
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
          <Label htmlFor="password">Password<RequiredIndicator /></Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError(validatePassword(e.target.value));
              }}
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
          {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
          {!passwordError && <p className="text-xs text-foreground/45">Min 8 characters, 1 uppercase, 1 number, 1 special character.</p>}
        </div>

        {(localError || authError) ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
            {localError || authError}
          </div>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={loading || cooldown}>
          {cooldown ? "Please wait..." : loading ? "Creating account..." : "Register"}
        </Button>

        <div className="text-center text-sm text-foreground/70 pt-1">
          Already have an account?{" "}
          <NavLink to="/login" className="font-medium text-primary underline underline-offset-4 hover:text-primary/80 transition-colors">
            Sign in here
          </NavLink>
        </div>
      </form>
    </div>
  );
}

