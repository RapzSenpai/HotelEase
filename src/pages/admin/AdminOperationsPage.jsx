import { useState } from "react";
import {
  CalendarDays,
  CreditCard,
  Megaphone,
  MessageSquareQuote,
  XCircle,
  Mail,
} from "lucide-react";
import FoBookingsPage from "@/pages/fo/FoBookingsPage";
import FoPaymentsPage from "@/pages/fo/FoPaymentsPage";
import FoAnnouncementsPage from "@/pages/fo/FoAnnouncementsPage";
import FoTestimonialsPage from "@/pages/fo/FoTestimonialsPage";
import FoCancellationsPage from "@/pages/fo/FoCancellationsPage";
import MessagesPage from "@/pages/fo/MessagesPage";

const TABS = [
  { id: "bookings", label: "Bookings", icon: CalendarDays, component: FoBookingsPage },
  { id: "payments", label: "Payments", icon: CreditCard, component: FoPaymentsPage },
  { id: "announcements", label: "Announcements", icon: Megaphone, component: FoAnnouncementsPage },
  { id: "reviews", label: "Reviews", icon: MessageSquareQuote, component: FoTestimonialsPage },
  { id: "cancellations", label: "Cancellations", icon: XCircle, component: FoCancellationsPage },
  { id: "messages", label: "Messages", icon: Mail, component: MessagesPage },
];

export default function AdminOperationsPage() {
  const [activeTab, setActiveTab] = useState("bookings");
  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.component;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="space-y-1.5">
        <h1 className="font-playfair text-4xl font-semibold tracking-tight">Operations</h1>
        <p className="text-foreground/60 max-w-lg">
          Manage bookings, payments, announcements, reviews, cancellations, and messages.
        </p>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-foreground/55 hover:bg-muted/50 hover:text-foreground/80 border border-transparent"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}
      <div className="min-h-[400px]">
        {ActiveComponent && <ActiveComponent />}
      </div>

    </div>
  );
}
