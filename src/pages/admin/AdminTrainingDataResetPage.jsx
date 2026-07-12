import { useState } from "react";
import { Button } from "@/components/ui/button";
import { resetTrainingData } from "@/services/trainingService";

export default function AdminTrainingDataResetPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  async function onReset() {
    setLoading(true);
    setStatus(null);
    setError(null);
    try {
      const res = await resetTrainingData();
      setStatus(
        res?.ok
          ? "Training data reset requested successfully."
          : "Reset completed.",
      );
    } catch (e) {
      setError(e?.message || "Failed to reset training data.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">
          Training Data Reset
        </h1>
        <p className="text-foreground/80">
          Clear all training sandbox data without affecting production records.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {error}
        </div>
      ) : null}

      {status ? (
        <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-foreground">
          {status}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-background p-5 space-y-4">
        <div className="text-sm text-foreground/70">
          Resets all <span className="font-mono">training_*</span> collections —
          bookings, guests, rooms, payments, and housekeeping logs — without
          touching any production data.
        </div>
        <Button variant="destructive" onClick={onReset} disabled={loading}>
          {loading ? "Resetting..." : "Reset Training Data"}
        </Button>
      </div>
    </div>
  );
}
