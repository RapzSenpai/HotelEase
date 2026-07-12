import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  generateTrainingSessionCode,
  getTrainingSystemState,
  setTrainingModeEnabled,
} from "@/services/trainingService";

export default function AdminSystemSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [trainingMode, setTrainingMode] = useState(false);
  const [sessionCode, setSessionCode] = useState(null);
  const [sessionExpiryIso, setSessionExpiryIso] = useState(null);

  const [ttlHours, setTtlHours] = useState(24);
  const [sessionBusy, setSessionBusy] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const sys = await getTrainingSystemState();
        if (!isMounted) return;

        setTrainingMode(Boolean(sys.enabled));
        setSessionCode(sys.sessionCode);
        setSessionExpiryIso(
          sys.sessionExpiryIso?.toString?.() ?? sys.sessionExpiryIso ?? null,
        );
      } catch (e) {
        if (!isMounted) return;
        setError(e?.message || "Failed to load training system settings.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  async function onToggle() {
    setError(null);
    try {
      await setTrainingModeEnabled(!trainingMode);
      const sys = await getTrainingSystemState();
      setTrainingMode(Boolean(sys.enabled));
      setSessionCode(sys.sessionCode);
      setSessionExpiryIso(
        sys.sessionExpiryIso?.toString?.() ?? sys.sessionExpiryIso ?? null,
      );
    } catch (e) {
      setError(e?.message || "Failed to toggle training mode.");
    }
  }

  async function onGenerateSessionCode() {
    setError(null);
    setSessionBusy(true);
    try {
      const res = await generateTrainingSessionCode({ ttlHours });
      setSessionCode(res.sessionCode);
      setSessionExpiryIso(res.expiryIso);
    } catch (e) {
      setError(e?.message || "Failed to generate session code.");
    } finally {
      setSessionBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">
          System Settings
        </h1>
        <p className="text-foreground/80">
          Configure training mode and generate session codes for students.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background p-5 space-y-4">
        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
            {error}
          </div>
        ) : null}

        <div className="space-y-1">
          <div className="font-semibold">Training Mode</div>
          <div className="text-sm text-foreground/70">
            When enabled, booking/guest actions use `training_*` collections.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={trainingMode ? "default" : "outline"}
            onClick={onToggle}
            disabled={loading}
          >
            {trainingMode ? "Training Mode: ON" : "Training Mode: OFF"}
          </Button>
        </div>

        <div className="space-y-2 pt-2 border-t border-border">
          <div className="space-y-1">
            <div className="font-semibold">Generate Session Code</div>
            <div className="text-sm text-foreground/70">
              Students use this code to join the training sandbox. Code expires
              automatically.
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ttlHours">Expiry (hours)</Label>
              <Input
                id="ttlHours"
                type="number"
                min={1}
                value={ttlHours}
                onChange={(e) => setTtlHours(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                className="w-full"
                onClick={onGenerateSessionCode}
                disabled={sessionBusy || !trainingMode}
              >
                {sessionBusy ? "Generating..." : "Generate Code"}
              </Button>
            </div>
          </div>

          {sessionCode ? (
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 space-y-2">
              <div className="text-sm text-foreground/70">
                Active session code
              </div>
              <div className="text-xl font-semibold tracking-wide">
                {sessionCode}
              </div>
              <div className="text-sm text-foreground/70">
                Expires at:{" "}
                {sessionExpiryIso
                  ? new Date(sessionExpiryIso).toLocaleString()
                  : "—"}
              </div>
            </div>
          ) : (
            <div className="text-sm text-foreground/70">
              {trainingMode
                ? "No active session code yet."
                : "Enable Training Mode to generate a code."}
            </div>
          )}
        </div>

        <div className="text-sm text-foreground/70">
          Note: Training data isolation is implemented by routing writes/reads
          to `training_*` collections.
        </div>
      </div>
    </div>
  );
}
