import { Link } from "react-router-dom";
import { Shield, Database, Eye, UserCheck, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const sections = [
  {
    icon: Eye,
    title: "Information We Collect",
    content: (
      <>
        <p>We collect the information needed to operate hotel workflows and guest support, including:</p>
        <ul className="mt-2 space-y-1.5 pl-1">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span>Full name</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span>Email address</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span>Phone number</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span>Booking details (dates, room, request metadata)</span>
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: Shield,
    title: "How We Use Your Information",
    content: (
      <>
        <p>Your data is used strictly for platform operations and learning delivery, including:</p>
        <ul className="mt-2 space-y-1.5 pl-1">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span>Booking management and reservation processing</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span>Sending status updates and notifications</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span>System improvement and feature quality checks</span>
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: Database,
    title: "Data Storage & Security",
    content: (
      <p>
        Data is stored in Firebase/Firestore for structured records and Cloudinary for hosted media assets. Access
        is controlled through authenticated roles and Firestore security rules.
      </p>
    ),
  },
  {
    icon: UserCheck,
    title: "Your Rights",
    content: (
      <p>
        You may request data access, correction, or deletion of your account information, subject to school policy.
      </p>
    ),
  },
  {
    icon: Mail,
    title: "Contact Us",
    content: (
      <p>
        For any privacy-related concern, visit our{" "}
        <Link to="/contact" className="font-medium text-primary underline underline-offset-2 hover:text-primary/80 transition-colors">
          Contact Page
        </Link>
        .
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <h1 className="font-playfair text-3xl font-semibold text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-sm text-foreground/55">
          Your privacy matters to us. This page explains how HotelEase handles your personal data.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((section) => (
          <Card key={section.title} className="overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start gap-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <section.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="min-w-0 space-y-2 text-sm leading-relaxed text-foreground/75">
                  <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
                  {section.content}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer */}
      <p className="text-center text-xs font-medium text-foreground/35">
        Last Updated: July 2026
      </p>
    </div>
  );
}
