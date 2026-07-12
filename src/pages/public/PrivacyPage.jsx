import { Link } from "react-router-dom";
import { Separator } from "@/components/ui/separator";

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-4xl rounded-2xl border border-border bg-background px-6 py-8 sm:px-10">
      <header className="space-y-2">
        <h1 className="font-playfair text-4xl font-semibold">Privacy Policy</h1>
        <p className="text-sm text-foreground/60">
          Your privacy matters to us. This page explains how BSHM-PMS (HotelEase) handles your personal data.
        </p>
      </header>

      <Separator className="my-6" />

      <section className="space-y-8 text-sm leading-relaxed text-foreground/80">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Information We Collect</h2>
          <p>We collect the information needed to operate hotel workflows and guest support, including:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Full name</li>
            <li>Email address</li>
            <li>Phone number</li>
            <li>Booking details (dates, room, request metadata)</li>
          </ul>
        </div>

        <Separator />

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">How We Use Your Information</h2>
          <p>Your data is used strictly for platform operations and learning delivery, including:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Booking management and reservation processing</li>
            <li>Sending status updates and notifications</li>
            <li>System improvement and feature quality checks</li>
          </ul>
        </div>

        <Separator />

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Data Storage &amp; Security</h2>
          <p>
            Data is stored in Firebase/Firestore for structured records and Cloudinary for hosted media assets. Access
            is controlled through authenticated roles and Firestore security rules.
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Your Rights</h2>
          <p>You may request data access, correction, or deletion of your account information, subject to school policy.</p>
        </div>

        <Separator />

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Contact Us</h2>
          <p>
            For any privacy-related concern, visit our{" "}
            <Link to="/contact" className="font-medium text-primary underline underline-offset-2">
              Contact Page
            </Link>
            .
          </p>
        </div>
      </section>

      <Separator className="my-6" />

      <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">Last Updated: March 2026</p>
    </article>
  );
}
