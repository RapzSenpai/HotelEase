import { useState } from "react";
import { useForm } from "react-hook-form";
import { Globe, Camera, MapPin, Mail, Phone, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { submitMessage } from "@/services/messageService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select } from "radix-ui";
import { Controller } from "react-hook-form";

const SUBJECT_OPTIONS = [
  "General Inquiry",
  "Booking Concern",
  "Technical Issue",
  "Feedback & Suggestions",
  "Other",
];

export default function ContactPage() {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
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

    setIsSubmitting(true);
    try {
      await submitMessage({
        name: values.name,
        email: values.email,
        subject: values.subject,
        message: values.message,
        guestId: user?.uid || null,
      });
      toast.success("Message sent! We'll get back to you shortly.");
      reset();
    } catch (e) {
      toast.error(e?.message || "Failed to send message.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>Reach out to the BSHM department support team.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <InfoRow icon={MapPin} label="Location" value="BSHM Department, Consolatrix College of Toledo City" />
            <InfoRow icon={Mail} label="Email" value="bshm-dept@consolatrix.edu.ph" />
            <InfoRow icon={Phone} label="Phone" value="+63 32 467 8901" />
            <InfoRow icon={Clock3} label="Office Hours" value="Mon-Fri, 8:00 AM - 5:00 PM" />

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">Social</p>
              <div className="flex items-center gap-3">
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-surface-hover transition-colors"
                  aria-label="Facebook"
                >
                  <Globe className="h-4 w-4" />
                </a>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-surface-hover transition-colors"
                  aria-label="Instagram"
                >
                  <Camera className="h-4 w-4" />
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
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

              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  {...register("name", { required: "Full name is required." })}
                  placeholder="Your full name"
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
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
                  placeholder="you@example.com"
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
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
                        className="flex h-10 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 shadow-xs"
                      >
                        <Select.Value placeholder="Select a subject" />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="z-50 max-h-64 min-w-[8rem] overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md animate-in fade-in zoom-in-95 duration-100">
                          <Select.Viewport className="p-1">
                            {SUBJECT_OPTIONS.map((option) => (
                              <Select.Item
                                key={option}
                                value={option}
                                className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
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
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  {...register("message", {
                    required: "Message is required.",
                    minLength: { value: 20, message: "Message must be at least 20 characters." },
                  })}
                  placeholder="Tell us how we can help..."
                  className="min-h-36"
                />
                {errors.message && <p className="text-xs text-destructive">{errors.message.message}</p>}
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Sending..." : "Submit Message"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-md border border-border p-1.5">
        <Icon className="h-4 w-4 text-foreground/65" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">{label}</p>
        <p className="text-sm text-foreground/80">{value}</p>
      </div>
    </div>
  );
}
