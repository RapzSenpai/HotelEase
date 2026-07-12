import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { NavLink, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, authError, loading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);

  function validatePassword(pw) {
    if (pw.length < 8) return "Password must be at least 8 characters.";
    if (!/\d/.test(pw)) return "Password must contain at least one number.";
    return null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setLocalError(null);

    const pwError = validatePassword(password);
    if (pwError) {
      setPasswordError(pwError);
      return;
    }
    setPasswordError(null);

    try {
      await register({ email, password, fullName });
      // New users are created as 'guest' in Phase 1.
      navigate("/my-bookings");
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
        <div className="space-y-2">
          <Label htmlFor="fullName">Full Name</Label>
          <Input
            id="fullName"
            required
            placeholder="Juan Dela Cruz"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="example@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              placeholder="••••••••"
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
        </div>

        {(localError || authError) ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
            {localError || authError}
          </div>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Creating account..." : "Register"}
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

