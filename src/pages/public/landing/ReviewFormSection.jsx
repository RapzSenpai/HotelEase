import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NavLink } from "react-router-dom";
import { Star, Quote } from "lucide-react";
import { createTestimonial } from "@/services/testimonialsService";
import { mapFirebaseError } from "@/lib/errors";
import { AmbientGlow } from "./components";
import { cleanPanel } from "./helpers";

function StarSelector({ value, onChange, disabled }) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value;
  return (
    <div className="flex gap-1" onMouseLeave={() => setHovered(0)}>
      {Array.from({ length: 5 }, (_, i) => {
        const star = i + 1;
        return (
          <button key={star} type="button" disabled={disabled} aria-label={`${star} star${star !== 1 ? "s" : ""}`} className="p-0.5 disabled:opacity-50 active:scale-95 transition-transform" onMouseEnter={() => setHovered(star)} onClick={() => onChange(star)}>
            <Star className={`h-7 w-7 transition-colors ${star <= display ? "fill-primary text-primary" : "text-foreground/25"}`} />
          </button>
        );
      })}
    </div>
  );
}

export default function ReviewFormSection({ isGuest, user, profile }) {
  const [formRating, setFormRating] = useState(0);
  const [formMessage, setFormMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  async function handleSubmitTestimonial(e) {
    e.preventDefault();
    setSubmitError(null);
    if (!formRating || formRating < 1) { setSubmitError("Please select a star rating."); return; }
    if (!formMessage.trim()) { setSubmitError("Please enter your review message."); return; }
    setSubmitting(true);
    try {
      await createTestimonial({ guestId: user.uid, guestName: profile?.fullName ?? "Guest", rating: formRating, message: formMessage.trim() });
      setFormRating(0);
      setFormMessage("");
      setSubmitSuccess(true);
    } catch (err) {
      setSubmitError(mapFirebaseError(err) || "Failed to submit your review.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="relative z-10 py-32 md:py-40 bg-[#FDF8F0] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_100%,rgba(245,197,24,0.05),transparent_65%)] pointer-events-none" />
      <AmbientGlow position="bottom-right" size="lg" intensity={0.12} />
      <AmbientGlow position="mid-left" size="sm" intensity={0.07} />
      <svg className="absolute inset-0 -z-10 h-full w-full pointer-events-none stroke-primary/10 fill-none opacity-25" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M-100,230 C350,80 850,380 1350,180 T2200,280" strokeWidth="0.75" strokeDasharray="3 3" />
        <path d="M-100,260 C350,110 850,410 1350,210 T2200,310" strokeWidth="0.5" />
        <path d="M-100,290 C350,140 850,440 1350,240 T2200,340" strokeWidth="0.5" />
      </svg>
      <div className="relative mx-auto max-w-4xl px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="font-playfair text-4xl md:text-5xl font-bold tracking-tight">
              Share Your <span className="text-amber-400">Experience</span>
            </h2>
            <p className="text-base text-foreground/70 leading-relaxed">
              Your feedback helps us improve and future guests make informed decisions. Take a moment to share your thoughts about your stay.
            </p>
            <div className="flex items-center gap-3 pt-4">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((i) => <Star key={i} className="h-5 w-5 fill-primary text-primary" />)}
              </div>
              <span className="text-sm text-foreground/60">Join our community of guests</span>
            </div>
          </div>
          <Card className={`${cleanPanel} overflow-hidden`}>
            <CardContent className="p-8">
              {submitSuccess ? (
                <div className="text-center space-y-4 py-6">
                  <div className="w-16 h-16 mx-auto rounded-full bg-success/10 flex items-center justify-center">
                    <Star className="h-8 w-8 text-success fill-success" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground mb-2">Thank You!</p>
                    <p className="text-sm text-foreground/60">Your review has been submitted and is pending approval.</p>
                  </div>
                </div>
              ) : isGuest ? (
                <form className="space-y-5" onSubmit={handleSubmitTestimonial}>
                  <div className="space-y-2">
                    <Label htmlFor="testimonial-rating" className="text-sm font-medium">Your Rating</Label>
                    <StarSelector value={formRating} onChange={setFormRating} disabled={submitting} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="testimonial-message" className="text-sm font-medium">Your Review</Label>
                    <Textarea id="testimonial-message" value={formMessage} onChange={(e) => setFormMessage(e.target.value)} placeholder="Tell us about your stay..." className="min-h-28 resize-none bg-white/50 backdrop-blur-sm border-white/40" disabled={submitting} />
                  </div>
                  {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
                  <Button type="submit" variant="default" className="w-full active:scale-[0.98]" disabled={submitting}>
                    {submitting ? "Submitting..." : "Submit Review"}
                  </Button>
                </form>
              ) : (
                <div className="text-center space-y-6 py-6">
                  <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                    <Quote className="h-8 w-8 text-primary" />
                  </div>
                  <div className="space-y-3">
                    <p className="text-base font-medium text-foreground">Sign In to Share Your Experience</p>
                    <p className="text-sm text-foreground/60">Join our guest community and leave a review.</p>
                  </div>
                  <Button asChild variant="default" className="w-full">
                    <NavLink to="/login">Sign In</NavLink>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
