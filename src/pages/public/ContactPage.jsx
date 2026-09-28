import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { MapPin, Mail, Phone, Clock3, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { submitMessage } from "@/services/messageService";
import { mapFirebaseError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RequiredIndicator from "@/components/common/RequiredIndicator";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import PageHero from "@/components/common/PageHero";
import { Select } from "radix-ui";
import { Controller } from "react-hook-form";

const SUBJECT_OPTIONS = [
  "General Inquiry",
  "Booking Concern",
  "Technical Issue",
  "Feedback & Suggestions",
  "Other",
];

const COOLDOWN_SECONDS = 30;

export default function ContactPage() {
  const { user, trainingMode } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef(null);

  useEffect(() => () => clearInterval(cooldownTimer.current), []);
  const { register, handleSubmit, formState: { errors }, reset, control: formControl } = useForm({
    defaultValues: {
      name: "",
      email: "",
      subject: SUBJECT_OPTIONS[0],
      message: "",
      honeypot: "",
    },
  });

  async function onSubmit(values) {
    if (values.honeypot?.trim()) {
      return;
    }

    if (cooldown > 0) {
      toast.error(`Please wait ${cooldown} seconds before sending another message.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await submitMessage({
        name: values.name,
        email: values.email,
        subject: values.subject,
        message: values.message,
        guestId: user?.uid || null,
        honeypot: values.honeypot || "",
        trainingMode,
      });
      toast.success("Message sent! We'll get back to you shortly.");
      reset();
      setCooldown(COOLDOWN_SECONDS);
      cooldownTimer.current = setInterval(() => {
        setCooldown((prev) => Math.max(0, prev - 1));
      }, 1000);
    } catch (e) {
      toast.error(mapFirebaseError(e) || "Failed to send message.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full space-y-10">
      {/* Header */}
      <PageHero
        eyebrow="Contact & Support"
        title="Get in Touch"
        subtitle="Have a question or need assistance? We're here to help."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Info Panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-5 space-y-5">
              <InfoRow icon={MapPin} label="Location" value="BSHM Department, Consolatrix College of Toledo City" />
              <InfoRow icon={Mail} label="Email" value="rapzzscofield@gmail.com" />
              <InfoRow icon={Phone} label="Phone" value="+63 32 467 8901" />
              <InfoRow icon={Clock3} label="Office Hours" value="Mon–Fri, 8:00 AM – 5:00 PM" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/40">Socials</p>
              <div className="flex items-center gap-3">
                <a
                  href="https://github.com/RapzSenpai"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-foreground/50 transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  aria-label="GitHub"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                </a>
                <a
                  href="https://www.facebook.com/Ging3rBr34ddd/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-foreground/50 transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  aria-label="Facebook"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Form */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Send a Message</CardTitle>
            <CardDescription>We typically respond within office hours.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <input
                id="honeypot"
                {...register("honeypot")}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ display: "none" }}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name<RequiredIndicator /></Label>
                  <Input
                    id="name"
                    {...register("name", { required: "Full name is required." })}
                    placeholder="Enter your full name"
                    className="h-11"
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address<RequiredIndicator /></Label>
                  <Input
                    id="email"
                    type="email"
                    {...register("email", {
                      required: "Email is required.",
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: "Please enter a valid email.",
                      },
                    })}
                    placeholder="Enter your email"
                    className="h-11"
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject<RequiredIndicator /></Label>
                <Controller
                  name="subject"
                  control={formControl}
                  rules={{ required: true }}
                  render={({ field }) => (
                    <Select.Root
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <Select.Trigger
                        id="subject"
                        className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 shadow-xs"
                      >
                        <Select.Value placeholder="Select a subject" />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content position="popper" side="bottom" align="start" sideOffset={4} className="z-50 max-h-64 min-w-[8rem] overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                          <Select.Viewport>
                            {SUBJECT_OPTIONS.map((option) => (
                              <Select.Item
                                key={option}
                                value={option}
                                className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:bg-primary/15 data-[highlighted]:text-foreground"
                              >
                                <Select.ItemText>{option}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message<RequiredIndicator /></Label>
                <Textarea
                  id="message"
                  {...register("message", {
                    required: "Message is required.",
                    minLength: { value: 20, message: "Message must be at least 20 characters." },
                    maxLength: { value: 2000, message: "Message must be at most 2000 characters." },
                  })}
                  placeholder="Tell us how we can help..."
                  className="min-h-36"
                  maxLength={2000}
                />
                {errors.message && <p className="text-xs text-destructive">{errors.message.message}</p>}
              </div>

              <Button type="submit" disabled={isSubmitting || cooldown > 0} className="w-full gap-2">
                <Send className="h-4 w-4" />
                {cooldown > 0 ? `Please wait ${cooldown}s` : isSubmitting ? "Sending..." : "Submit Message"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  const Icon = icon;
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground/45">{label}</p>
        <p className="text-sm text-foreground/80">{value}</p>
      </div>
    </div>
  );
}
