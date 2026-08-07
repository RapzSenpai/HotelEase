import {
  Wifi,
  Bath,
  BedDouble,
  Sparkles,
  CalendarDays,
  Shield,
  Headphones,
  Heart,
} from "lucide-react";

export const cleanPanel =
  "rounded-2xl border border-border/60 bg-white shadow-[0_2px_24px_rgba(28,28,30,0.06)]";

export const FEATURES = [
  {
    icon: CalendarDays,
    title: "Effortless Reservations",
    desc: "Browse available rooms and book your stay in minutes, with instant confirmation.",
  },
  {
    icon: Shield,
    title: "Trusted & Transparent",
    desc: "Your booking details and personal information are always safe with us.",
  },
  {
    icon: Headphones,
    title: "Always Here for You",
    desc: "Our concierge is available around the clock to help with anything you need during your stay.",
  },
  {
    icon: Heart,
    title: "Built with Love",
    desc: "Crafted with dedication by our team, putting our hearts into every detail to make your experience exceptional.",
  },
];

export const BENTO_FEATURE_LAYOUT = ["wide", "compact", "compact", "wide"];

export function getRoomAmenities(room) {
  return Array.isArray(room?.amenities) ? room.amenities.filter(Boolean) : [];
}

export function getRoomHeadline(room) {
  const desc = String(room?.description ?? "").trim();
  if (desc) {
    return desc.length > 88 ? `${desc.slice(0, 85)}...` : desc;
  }
  return `A refined ${room?.type || "stay"} designed for comfort and quiet elegance.`;
}

export function amenityIcon(name) {
  const key = String(name ?? "").toLowerCase();
  if (key.includes("wifi") || key.includes("internet")) return Wifi;
  if (key.includes("bath") || key.includes("shower")) return Bath;
  if (key.includes("bed") || key.includes("linen")) return BedDouble;
  return Sparkles;
}

export function formatRatingBadge(rating) {
  if (!rating?.count) return null;
  return rating.avg.toFixed(1);
}

export function formatDate(dateLike) {
  try {
    const d = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
    if (!d || isNaN(d)) return "—";
    return d.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}