import { useEffect, useState, useMemo, memo, useCallback, useRef } from "react";
import { useTypewriter } from "@/hooks/useTypewriter";
import heroBg from "@/assets/background.png";
import image2 from "@/assets/2.jpg";
import image3 from "@/assets/3.jpg";
import image4 from "@/assets/4.jpg";
import image5 from "@/assets/5.jpg";
import hotelLogo from "@/assets/Hotellogo.png";
import cctcLogo from "@/assets/logocctc.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { NavLink, useNavigate, Navigate } from "react-router-dom";
import { listAnnouncements } from "@/services/announcementsService";
import { subscribeToRooms } from "@/services/roomsService";
import { listReviewsForRoom } from "@/services/reviewsService";
import {
  createTestimonial,
  subscribeToApprovedTestimonials,
} from "@/services/testimonialsService";
import { useAuth } from "@/contexts/AuthContext";
import { getHomePathForRole, isStaffRole } from "@/lib/routing";
import ChatbotWidget from "@/components/chatbot/ChatbotWidget";
import {
  Star,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Shield,
  Headphones,
  Heart,
  Quote,
  BedDouble,
  Sparkles,
  Wifi,
  Bath,
  Image,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

const cleanPanel =
  "rounded-2xl border border-border/60 bg-white shadow-[0_2px_24px_rgba(28,28,30,0.06)]";

function SectionEyebrow({ children }) {
  return (
    <Badge variant="primary" className="px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-semibold">
      {children}
    </Badge>
  );
}

function LayeredLogoBadge({ src, alt, logoSize = 85 }) {
  return (
    <div className="relative flex h-52 w-52 items-center justify-center md:h-56 md:w-56">
      <div className="absolute inset-[6%] z-10 flex items-center justify-center rounded-full border border-border/40 bg-white shadow-[0_4px_20px_rgba(28,28,30,0.08),0_1px_4px_rgba(28,28,30,0.04)]">
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={`h-[${logoSize}%] w-[${logoSize}%] max-w-[${logoSize}%] object-contain`}
        />
      </div>
    </div>
  );
}

const StarRating = memo(function StarRating({ avg, count }) {
  if (!count)
    return <span className="text-xs text-foreground/40">No reviews yet</span>;
  const full = Math.round(avg);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${i < full ? "fill-primary text-primary" : "text-foreground/20"}`}
          />
        ))}
      </div>
      <span className="text-xs text-foreground/60">
        {avg.toFixed(1)}
      </span>
    </div>
  );
});

function formatDate(dateLike) {
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

// ─── Static Data ─────────────────────────────────────────────────────────────

const FEATURES = [
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

const BENTO_FEATURE_LAYOUT = ["wide", "compact", "compact", "wide"];

function getRoomAmenities(room) {
  return Array.isArray(room?.amenities) ? room.amenities.filter(Boolean) : [];
}

function getRoomHeadline(room) {
  const desc = String(room?.description ?? "").trim();
  if (desc) {
    return desc.length > 88 ? `${desc.slice(0, 85)}...` : desc;
  }
  return `A refined ${room?.type || "stay"} designed for comfort and quiet elegance.`;
}

function getBasicInfoSpecs(room) {
  return [
    { label: "Room Type", value: room?.type || "Standard" },
    { label: "Room No.", value: room?.roomNumber ? `#${room.roomNumber}` : "On request" },
    { label: "Floor", value: room?.floor ? `Level ${room.floor}` : "Ground+" },
    {
      label: "Availability",
      value: room?.status === "Available" ? "Open for booking" : room?.status || "Check status",
    },
  ];
}

function amenityIcon(name) {
  const key = String(name ?? "").toLowerCase();
  if (key.includes("wifi") || key.includes("internet")) return Wifi;
  if (key.includes("bath") || key.includes("shower")) return Bath;
  if (key.includes("bed") || key.includes("linen")) return BedDouble;
  return Sparkles;
}

function formatRatingBadge(rating) {
  if (!rating?.count) return null;
  return rating.avg.toFixed(1);
}

// ─── Room Showcase ────────────────────────────────────────────────────────────

const RoomTile = memo(function RoomTile({ room, rating, onView, onBook, size = 'medium', canBook = true }) {
  const firstPhoto = room.photos?.[0] ?? null;
  const rate = Number(room.ratePerNight ?? 0);
  const amenities = getRoomAmenities(room);
  const ratingLabel = formatRatingBadge(rating);

  const sizeClasses = {
    large: 'lg:col-span-2 lg:row-span-2',
    medium: 'lg:col-span-1 lg:row-span-1',
    wide: 'lg:col-span-2 lg:row-span-1',
  };

  const heightClasses = {
    large: 'min-h-[400px] lg:min-h-[480px]',
    medium: 'min-h-[280px] lg:min-h-[240px]',
    wide: 'min-h-[280px] lg:min-h-[240px]',
  };

  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-border/40 bg-white shadow-[0_4px_24px_rgba(28,28,30,0.06)] transition-all duration-300 hover:shadow-[0_8px_32px_rgba(28,28,30,0.1)] ${sizeClasses[size]} ${heightClasses[size]}`}>
      {/* Image Background - Clickable for details */}
      <button
        onClick={onView}
        className="absolute inset-0 w-full h-full cursor-pointer"
        aria-label={`View details for ${room.name || room.type}`}
      >
        {firstPhoto ? (
          <img
            src={firstPhoto}
            alt={room.name || room.type}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted/25 to-background text-sm text-foreground/30">
            No photo available
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      </button>

      {/* Rating Badge */}
      {ratingLabel ? (
          <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full border border-primary/20 bg-gradient-to-r from-primary to-primary/90 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_4px_12px_rgba(245,197,24,0.3)] backdrop-blur-sm">
            <Star className="h-3.5 w-3.5 fill-white text-white" />
            {ratingLabel}
          </div>
        ) : null}

      {/* Content Overlay */}
      <div className={`absolute inset-0 flex flex-col justify-end pointer-events-none ${size === 'large' ? 'p-5 lg:p-6 lg:pb-4' : 'p-5 lg:p-6'}`}>
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80">
            {room.type || "Suite"}
          </p>
          <h3 className={`font-playfair font-semibold leading-[1.1] tracking-tight text-white ${size === 'large' ? 'text-2xl lg:text-3xl' : 'text-lg lg:text-xl'}`}>
            {room.name || getRoomHeadline(room)}
          </h3>
          {size === 'large' && (
            <p className="text-sm leading-relaxed text-white/70 line-clamp-2">{getRoomHeadline(room)}</p>
          )}
        </div>

        <div className={`flex items-center justify-between ${size === 'large' ? 'mt-4 gap-4' : 'mt-4 gap-3'}`}>
          <div>
            <p className={`font-playfair font-bold tabular-nums tracking-tight text-white ${size === 'large' ? 'text-2xl' : 'text-xl'}`}>
              PHP {rate.toLocaleString()}
            </p>
            <p className="text-[10px] text-white/60">per night</p>
          </div>
          <Button
            size={size === 'large' ? 'lg' : 'default'}
            variant="default"
            className={`${size === 'large' ? 'px-8 py-6 text-base' : ''} text-white shadow-lg active:scale-[0.98] pointer-events-auto`}
            onClick={(e) => {
              e.stopPropagation();
              if (canBook) onBook();
              else onView();
            }}
          >
            {canBook ? "Book Now" : "View Details"}
          </Button>
        </div>

        {/* Amenities Preview (large tile only) */}
        {size === 'large' && amenities.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {amenities.slice(0, 4).map((amenity) => {
              const Icon = amenityIcon(amenity);
              return (
                <div key={amenity} className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">
                  <Icon className="h-3 w-3 text-white/80" strokeWidth={1.75} />
                  <span className="text-[10px] font-medium text-white/90">{amenity}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});


function FeaturedRoomsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 lg:row-span-2 min-h-[400px] lg:min-h-[480px] rounded-2xl bg-muted/15 animate-pulse" />
      <div className="min-h-[280px] lg:min-h-[240px] rounded-2xl bg-muted/15 animate-pulse" />
      <div className="min-h-[280px] lg:min-h-[240px] rounded-2xl bg-muted/15 animate-pulse" />
    </div>
  );
}

const TestimonialCardItem = memo(function TestimonialCardItem({ testimonial }) {
  const rating = Number(testimonial.rating ?? 5);
  const isHighRating = rating === 5;

  return (
    <div
      className={`rounded-2xl p-6 md:p-8 border transition-all duration-300 ${isHighRating
          ? "border-primary/30 bg-primary/5 shadow-[0_2px_12px_rgba(245,197,24,0.05)]"
          : "border-border/60 bg-white shadow-[0_2px_12px_rgba(28,28,30,0.04)]"
        }`}
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <span className="font-semibold text-sm text-foreground truncate max-w-[150px]">
          {testimonial.guestName || "Verified Guest"}
        </span>
        <div className="flex text-primary shrink-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-3 w-3 ${i < rating ? "fill-primary text-primary" : "text-foreground/20"}`}
            />
          ))}
        </div>
      </div>

      <p className="font-playfair italic text-foreground/85 text-base leading-relaxed tracking-wide pl-1 mt-3">
        “{testimonial.message}”
      </p>
    </div>
  );
});

function StarSelector({ value, onChange, disabled }) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value;

  return (
    <div className="flex gap-1" onMouseLeave={() => setHovered(0)}>
      {Array.from({ length: 5 }, (_, i) => {
        const star = i + 1;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
            className="p-0.5 disabled:opacity-50 active:scale-95 transition-transform"
            onMouseEnter={() => setHovered(star)}
            onClick={() => onChange(star)}
          >
            <Star
              className={`h-7 w-7 transition-colors ${star <= display ? "fill-primary text-primary" : "text-foreground/25"
                }`}
            />
          </button>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, role, profile, loading } = useAuth();

  // Staff accounts use the dashboard — keep them out of the public guest experience.
  if (!loading && user && isStaffRole(role)) {
    return <Navigate to={getHomePathForRole(role)} replace />;
  }

  // Announcements
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [announcementsError, setAnnouncementsError] = useState(null);

  // Rooms
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);

  // Ratings per room id
  const [roomRatings, setRoomRatings] = useState({});

  // Testimonials
  const [testimonials, setTestimonials] = useState([]);
  const [visibleCount, setVisibleCount] = useState(4);

  const overallStats = useMemo(() => {
    if (testimonials.length === 0) return { avg: 0, count: 0 };
    const count = testimonials.length;
    const avg = testimonials.reduce((s, t) => s + Number(t.rating ?? 0), 0) / count;
    return { avg, count };
  }, [testimonials]);

  const displayedTestimonials = useMemo(() => {
    return testimonials.slice(0, visibleCount);
  }, [testimonials, visibleCount]);

  const { leftCol, rightCol } = useMemo(() => {
    const left = [];
    const right = [];
    displayedTestimonials.forEach((t, index) => {
      if (index % 2 === 0) {
        left.push(t);
      } else {
        right.push(t);
      }
    });
    return { leftCol: left, rightCol: right };
  }, [displayedTestimonials]);

  const hasMoreToShow = visibleCount < testimonials.length;
  const canShowLess = visibleCount > 4;

  // Review submission form
  const [formRating, setFormRating] = useState(0);
  const [formMessage, setFormMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Showcase: first 3 active rooms, Available-first
  const showcaseRooms = useMemo(() => {
    return rooms
      .filter((r) => r.isActive !== false)
      .sort(
        (a, b) =>
          (b.status === "Available" ? 1 : 0) - (a.status === "Available" ? 1 : 0),
      )
      .slice(0, 3);
  }, [rooms]);

  const handleViewRoom = useCallback(
    (roomId) => {
      navigate(user ? `/rooms/${roomId}` : "/rooms");
    },
    [navigate, user],
  );

  const handleBookRoom = useCallback(
    (roomId) => {
      if (isStaffRole(role)) {
        navigate(`/rooms/${roomId}`);
        return;
      }
      if (user && role === "guest") {
        navigate(`/booking/${roomId}`);
        return;
      }
      navigate("/login");
    },
    [navigate, user, role],
  );

  const isGuest = Boolean(user && role === "guest");
  const isStaff = isStaffRole(role);
  const canBookRooms = !user || isGuest;
  const staffDashboardPath = getHomePathForRole(role);

  const heroEndRef = useRef(null);

  // Typewriter effect for hero section
  const { word: changingWord, isDeleting } = useTypewriter(
    ["Redefined", "Elevated", "Refined", "Timeless"],
    80,  // typing speed
    40,  // deleting speed
    2500 // pause duration
  );

  // ── Fetch announcements ───────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    setAnnouncementsLoading(true);
    listAnnouncements({ limitCount: 6 })
      .then((data) => {
        if (isMounted) {
          setAnnouncements(data);
          setAnnouncementsLoading(false);
        }
      })
      .catch((e) => {
        if (isMounted) {
          setAnnouncementsError(e?.message || "Failed to load announcements.");
          setAnnouncementsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);


  // ── Subscribe to rooms ────────────────────────────────────────────────────
  useEffect(() => {
    setRoomsLoading(true);
    let settled = false;
    const unsub = subscribeToRooms((data) => {
      setRooms(data);
      if (!settled) {
        settled = true;
        setRoomsLoading(false);
      }
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  // ── Subscribe to approved testimonials ────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToApprovedTestimonials((data) => {
      setTestimonials(data);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  // ── Fetch ratings for showcase rooms ─────────────────────────────────────
  useEffect(() => {
    if (showcaseRooms.length === 0) return;
    let isMounted = true;

    async function fetchRatings() {
      const entries = await Promise.all(
        showcaseRooms.map(async (room) => {
          try {
            const reviews = await listReviewsForRoom(room.id);
            const count = reviews.length;
            const avg =
              count > 0
                ? reviews.reduce((s, r) => s + Number(r.rating ?? 0), 0) / count
                : 0;
            return [room.id, { avg, count }];
          } catch {
            return [room.id, { avg: 0, count: 0 }];
          }
        }),
      );
      if (!isMounted) return;
      setRoomRatings(Object.fromEntries(entries));
    }

    fetchRatings();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showcaseRooms]);

  async function handleSubmitTestimonial(e) {
    e.preventDefault();
    setSubmitError(null);

    if (!formRating || formRating < 1) {
      setSubmitError("Please select a star rating.");
      return;
    }
    if (!formMessage.trim()) {
      setSubmitError("Please enter your review message.");
      return;
    }

    setSubmitting(true);
    try {
      await createTestimonial({
        guestId: user.uid,
        guestName: profile?.fullName ?? "Guest",
        rating: formRating,
        message: formMessage.trim(),
      });
      setFormRating(0);
      setFormMessage("");
      setSubmitSuccess(true);
    } catch (err) {
      setSubmitError(err?.message || "Failed to submit your review.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="overflow-x-hidden">
      {/* ── 1. Hero ───────────────────────────────────────────────────────── */}
      <section className="relative z-10 flex min-h-[90dvh] items-center overflow-hidden">
        <div className="absolute inset-0 -z-10 pointer-events-none bg-gradient-to-b from-background/40 via-background/30 to-background/60" aria-hidden="true" />
        <div className="mx-auto w-full max-w-7xl px-6 py-4 md:py-6">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
            <div className="lg:col-span-6 space-y-8">
              <SectionEyebrow>Consolatrix Suites, Toledo City</SectionEyebrow>

              <h1 className="font-playfair text-[2.75rem] font-bold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl text-foreground max-w-2xl">
                Experience Comfort,
                <br />
                <span className="text-primary" style={{ textShadow: "0 0 30px rgba(245, 197, 24, 0.4), 0 0 60px rgba(245, 197, 24, 0.2)" }}>
                  {changingWord}
                  <span className="inline-block w-0.5 h-1 ml-1 align-middle bg-primary animate-pulse" />
                </span>
              </h1>

              <p className="max-w-xl text-lg leading-relaxed text-foreground/80">
                Welcome to HotelEase — where every detail is taken care of. Browse our rooms, make a reservation, and enjoy a stay that feels effortlessly perfect.
              </p>

              <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex flex-wrap gap-3">
                  <Button asChild size="lg" variant="default" className="gap-2 px-7 shadow-md active:scale-[0.98]">
                    <NavLink to="/rooms">
                      Browse Rooms
                      <ArrowRight className="h-4 w-4" />
                    </NavLink>
                  </Button>
                  {!user ? (
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="bg-white/50 backdrop-blur-sm border-white/40 active:scale-[0.98]"
                    >
                      <NavLink to="/login">Sign In</NavLink>
                    </Button>
                  ) : isStaff ? (
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="bg-white/50 backdrop-blur-sm border-white/40 active:scale-[0.98]"
                    >
                      <NavLink to={staffDashboardPath}>
                        Go to Dashboard
                        <ArrowRight className="h-4 w-4" />
                      </NavLink>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 w-full flex justify-center lg:justify-end">
              <div className="grid grid-cols-2 gap-3 h-[420px] sm:h-[480px] md:grid-cols-12 md:grid-rows-6 md:h-[550px] lg:h-[600px] w-full max-w-2xl">
                {/* Tile 1: Main (heroBg) */}
                <div className="col-span-2 md:col-span-8 md:row-span-4 rounded-[2rem] overflow-hidden shadow-lg border border-border/10 group hover:scale-[1.02] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
                  <div className="relative w-full h-full">
                    <img
                      src={heroBg}
                      alt="Consolatrix Suites"
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                  </div>
                </div>

                {/* Tile 2: Top Right (image2) */}
                <div className="col-span-1 md:col-span-4 md:row-span-2 rounded-[2rem] overflow-hidden shadow-md border border-border/10 group hover:scale-[1.02] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
                  <div className="relative w-full h-full">
                    <img
                      src={image2}
                      alt="Hotel Interior"
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                  </div>
                </div>

                {/* Tile 3: Mid Right (image3) */}
                <div className="hidden md:block md:col-span-4 md:row-span-4 rounded-[2rem] overflow-hidden shadow-md border border-border/10 group hover:scale-[1.02] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
                  <div className="relative w-full h-full">
                    <img
                      src={image3}
                      alt="Hotel Amenities"
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                  </div>
                </div>

                {/* Tile 4: Bottom Left (image4) */}
                <div className="col-span-1 md:col-span-4 md:row-span-2 rounded-[2rem] overflow-hidden shadow-md border border-border/10 group hover:scale-[1.02] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
                  <div className="relative w-full h-full">
                    <img
                      src={image4}
                      alt="Room View"
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                  </div>
                </div>

                {/* Tile 5: Bottom Mid (image5) */}
                <div className="hidden md:block md:col-span-4 md:row-span-2 rounded-[2rem] overflow-hidden shadow-md border border-border/10 group hover:scale-[1.02] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
                  <div className="relative w-full h-full">
                    <img
                      src={image5}
                      alt="Dining Area"
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div ref={heroEndRef} className="absolute bottom-0 left-0 h-px w-full" aria-hidden="true" />
      </section>

      {/* ── 2. Academic Partnership ─────────────────────────────────────────── */}
      <section className="relative z-10 py-32 md:py-40 bg-background">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(245,197,24,0.03),transparent_65%)] pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <div className="mb-6">
              <SectionEyebrow>Capstone Project</SectionEyebrow>
            </div>
            <h2 className="font-playfair text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-6">
              Academic Collaboration
            </h2>
            <p className="text-lg text-foreground/70 leading-relaxed max-w-2xl mx-auto">
              HotelEase is a capstone project developed by Information Technology students at Consolatrix College of Toledo City, bringing modern hotel management to Consolatrix Suites with seamless booking and guest services.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center max-w-4xl mx-auto">
            <div className="flex flex-col items-center text-center space-y-6">
              <LayeredLogoBadge
                src={hotelLogo}
                alt="HotelEase"
              />
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground text-lg">HotelEase</h3>
                <p className="text-sm text-foreground/60">Capstone Project</p>
              </div>
            </div>

            <div className="flex flex-col items-center text-center space-y-6">
              <LayeredLogoBadge
                src={cctcLogo}
                alt="Consolatrix College of Toledo City"
                logoSize={95}
              />
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground text-lg">Consolatrix College</h3>
                <p className="text-sm text-foreground/60">Toledo City, Philippines</p>
              </div>
            </div>
          </div>


        </div>
      </section>

      {/* ── 3. Room Showcase (Bento) ──────────────────────────────────────── */}
      <section className="relative z-10 py-32 md:py-40 bg-amber-50/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_0%_50%,rgba(245,197,24,0.02),transparent_50%)] pointer-events-none" />
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-14 space-y-4 max-w-2xl">
            <SectionEyebrow>Our Rooms</SectionEyebrow>
            <h2 className="font-playfair text-4xl md:text-5xl font-bold tracking-tight">
              Featured Accommodations
            </h2>
            <p className="text-foreground/60 leading-relaxed">
              Explore our available rooms, each designed for comfort and elegance.
            </p>
          </div>

          {roomsLoading ? (
            <FeaturedRoomsSkeleton />
          ) : showcaseRooms.length === 0 ? (
            <Card className={`${cleanPanel} p-12 text-center text-foreground/50`}>
              <CardContent className="p-0">No rooms available at the moment.</CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-[240px]">
              <RoomTile
                room={showcaseRooms[0]}
                rating={roomRatings[showcaseRooms[0].id]}
                onView={() => handleViewRoom(showcaseRooms[0].id)}
                onBook={() => handleBookRoom(showcaseRooms[0].id)}
                canBook={canBookRooms}
                size="large"
              />
              {showcaseRooms.slice(1).map((room, index) => (
                <RoomTile
                  key={room.id}
                  room={room}
                  rating={roomRatings[room.id]}
                  onView={() => handleViewRoom(room.id)}
                  onBook={() => handleBookRoom(room.id)}
                  canBook={canBookRooms}
                  size="medium"
                />
              ))}
            </div>
          )}

          <div className="mt-12 flex justify-start md:justify-center">
            <Button asChild variant="outline" size="lg" className="bg-white/70 backdrop-blur-sm">
              <NavLink to="/rooms">View All Rooms</NavLink>
            </Button>
          </div>
        </div>
      </section>

      {/* ── 4. Features (Bento) ─────────────────────────────────────────── */}
      <section className="relative z-10 py-32 md:py-40 bg-background">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(245,197,24,0.04),transparent_70%)] pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="mb-16 max-w-2xl space-y-4">
            <SectionEyebrow>Why HotelEase</SectionEyebrow>
            <h2 className="font-playfair text-4xl md:text-5xl font-bold tracking-tight text-foreground">
              Everything You Need
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
            {FEATURES.map((f, index) => {
              const Icon = f.icon;
              const layout = BENTO_FEATURE_LAYOUT[index] ?? "compact";
              const isWide = layout === "wide";

              return (
                <Card
                  key={f.title}
                  className={`border-border/60 bg-white shadow-[0_2px_20px_rgba(28,28,30,0.06)] ${isWide
                      ? "md:col-span-7 p-7 md:p-8"
                      : "md:col-span-5 p-6 md:p-7"
                    }`}
                >
                  <CardContent className="p-0 flex flex-col gap-5 h-full">
                    <div
                      className={`flex items-center justify-center rounded-xl border border-primary/10 bg-gradient-to-br from-primary/5 to-primary/[0.02] ${isWide ? "h-16 w-16" : "h-14 w-14"
                        }`}
                    >
                      <Icon className={`text-primary ${isWide ? "h-8 w-8" : "h-7 w-7"}`} />
                    </div>
                    <div className="space-y-2.5 flex-1">
                      <CardTitle
                        className={`font-playfair text-foreground ${isWide ? "text-2xl md:text-3xl" : "text-xl"
                          }`}
                      >
                        {f.title}
                      </CardTitle>
                      <CardDescription
                        className={`text-foreground/60 leading-relaxed ${isWide ? "text-base max-w-lg" : "text-sm"
                          }`}
                      >
                        {f.desc}
                      </CardDescription>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 5. Guest Testimonials ─────────────────────────────────────────── */}
      <section className="relative z-10 py-32 md:py-40 bg-background">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_10%_30%,rgba(245,197,24,0.02),transparent_50%)] pointer-events-none" />
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">

            {/* Left Column: Header and rating summary */}
            <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-8">
              <div className="space-y-4">
                <SectionEyebrow>Guest Reviews</SectionEyebrow>
                <h2 className="font-playfair text-4xl md:text-5xl font-bold tracking-tight text-foreground leading-[1.1]">
                  Beloved by <br />
                  Our Guests
                </h2>
                <p className="text-foreground/60 leading-relaxed text-sm max-w-md">
                  Every stay is an opportunity to create beautiful memories. Here is what our guests have shared about their time at Consolatrix Suites.
                </p>
              </div>

              {overallStats.count > 0 && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground/40">
                    <Star className="h-3.5 w-3.5 text-primary" />
                    <span>Overall Rating</span>
                  </div>
                  <div className="flex items-end gap-3">
                    <span className="font-playfair text-5xl font-bold text-foreground leading-none tracking-tight">
                      {overallStats.avg.toFixed(1)}
                    </span>
                    <div className="pb-1">
                      <span className="text-sm text-foreground/40 font-medium block">/ 5.0</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-4 w-4 ${i < Math.round(overallStats.avg) ? "fill-primary text-primary" : "text-foreground/15"}`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-foreground/50 font-medium">
                      Based on {overallStats.count} verified guest {overallStats.count === 1 ? "review" : "reviews"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Asymmetric Grid & Progressive Disclosure */}
            <div className="lg:col-span-8">
              {testimonials.length === 0 ? (
                <Card className={`${cleanPanel} p-10 text-center`}>
                  <CardContent className="p-0 text-sm text-foreground/55">
                    No reviews yet - be the first to share your experience!
                  </CardContent>
                </Card>
              ) : (
                <Card className={`${cleanPanel} border-0 shadow-none bg-transparent overflow-visible`}>
                  <CardContent className="p-0 relative">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                      {/* Left Column of Grid */}
                      <div className="space-y-6">
                        {leftCol.map((t) => (
                          <TestimonialCardItem key={t.id} testimonial={t} />
                        ))}
                      </div>

                      {/* Right Column of Grid - Staggered down */}
                      <div className="space-y-6 md:mt-8">
                        {rightCol.map((t) => (
                          <TestimonialCardItem key={t.id} testimonial={t} />
                        ))}
                      </div>
                    </div>

                    {/* Progressive disclosure controls */}
                    {(hasMoreToShow || canShowLess) && (
                      <div className={`${hasMoreToShow ? 'absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-background via-background/90 to-transparent pointer-events-none' : 'mt-8'} flex items-end justify-center pb-2`}>
                        <div className="flex flex-col items-center gap-2 pointer-events-auto">
                          <span className="text-xs text-foreground/45 font-medium">
                            Showing {Math.min(visibleCount, testimonials.length)} of {testimonials.length} reviews
                          </span>
                          <div className="flex gap-2">
                            {canShowLess && (
                              <Button
                                onClick={() => setVisibleCount(4)}
                                variant="ghost"
                                size="sm"
                                className="text-foreground/60 hover:text-foreground active:scale-[0.98]"
                              >
                                Show less
                              </Button>
                            )}
                            {hasMoreToShow && (
                              <Button
                                onClick={() => setVisibleCount((prev) => Math.min(prev + 4, testimonials.length))}
                                variant="outline"
                                className="bg-white/80 backdrop-blur-sm border-border shadow-sm hover:bg-white hover:text-foreground active:scale-[0.98]"
                              >
                                Show more ({Math.min(4, testimonials.length - visibleCount)} more)
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

          </div>
        </div>
      </section>

      {/* ── 6. Announcements (Bento) ──────────────────────────────────────── */}
      <section className="relative z-10 py-32 md:py-40 bg-background">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_100%_0%,rgba(245,197,24,0.02),transparent_60%)] pointer-events-none" />
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-14 space-y-4 max-w-2xl">
            <SectionEyebrow>News & Events</SectionEyebrow>
            <h2 className="font-playfair text-4xl md:text-5xl font-bold tracking-tight">
              Latest Announcements
            </h2>
          </div>

          {announcementsError && (
            <Card className="mb-6 border-destructive/30 bg-destructive/10">
              <CardContent className="p-4 text-sm text-foreground">{announcementsError}</CardContent>
            </Card>
          )}

          {announcementsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5">
              <div className="md:col-span-7 h-72 rounded-2xl border border-border bg-muted/10 animate-pulse" />
              <div className="md:col-span-5 h-56 rounded-2xl border border-border bg-muted/10 animate-pulse" />
              <div className="md:col-span-5 h-56 rounded-2xl border border-border bg-muted/10 animate-pulse" />
            </div>
          ) : announcements.length === 0 ? (
            <Card className={`${cleanPanel} p-10 text-center text-foreground/50 text-sm`}>
              <CardContent className="p-0">No announcements yet.</CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5 items-start">
              {announcements.map((a, index) => {
                const isFeatured = index === 0;
                const isSpecial = /special|offer|limited/i.test(a.title);
                return (
                  <Card
                    key={a.id}
                    className={`group overflow-hidden border-border/60 bg-gradient-to-br from-primary/5 to-primary/[0.02] shadow-[0_2px_20px_rgba(28,28,30,0.04)] hover:shadow-[0_4px_28px_rgba(28,28,30,0.08)] transition-all duration-300 ease-out rounded-2xl ${isFeatured ? "md:col-span-7" : "md:col-span-5"}`}
                  >
                    {a.imageUrl ? (
                      <div className={`overflow-hidden ${isFeatured ? "h-64 md:h-72" : "h-56"}`}>
                        <img
                          src={a.imageUrl}
                          alt={a.title}
                          className="h-full w-full object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
                        />
                      </div>
                    ) : (
                      <div className={`overflow-hidden ${isFeatured ? "h-64 md:h-72" : "h-56"} flex items-center justify-center bg-primary/5 rounded-2xl`}>
                        <Image className="h-8 w-8 text-primary/30" />
                      </div>
                    )}
                    <CardHeader className={`space-y-2 ${isFeatured ? "p-4 md:p-5" : "p-3 md:p-4"}`}>
                      <Badge variant="muted" className="w-fit rounded-full text-[11px] uppercase tracking-wide">
                        {formatDate(a.date)}
                      </Badge>
                      <CardTitle
                        className={`font-playfair leading-snug ${isFeatured ? "text-lg md:text-xl" : "text-base md:text-lg"
                          }`}
                      >
                        {a.title}
                      </CardTitle>
                      <CardDescription
                        className={`leading-relaxed ${isFeatured ? "text-sm line-clamp-4" : "text-sm line-clamp-3"
                          }`}
                      >
                        {a.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── 7. Review Submission (guests & visitors only) ───────────────────── */}
      {!isStaff && (
        <section className="relative z-10 py-32 md:py-40 bg-amber-50/25">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_100%,rgba(245,197,24,0.05),transparent_65%)] pointer-events-none" />
          <div className="relative mx-auto max-w-4xl px-6">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <h2 className="font-playfair text-4xl md:text-5xl font-bold tracking-tight">
                  Share Your{" "}
                  <span className="text-amber-400">Experience</span>
                </h2>
                <p className="text-base text-foreground/70 leading-relaxed">
                  Your feedback helps us improve and future guests make informed decisions. Take a moment to share your thoughts about your stay.
                </p>
                <div className="flex items-center gap-3 pt-4">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                    ))}
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
                        <StarSelector
                          value={formRating}
                          onChange={setFormRating}
                          disabled={submitting}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="testimonial-message" className="text-sm font-medium">Your Review</Label>
                        <Textarea
                          id="testimonial-message"
                          value={formMessage}
                          onChange={(e) => setFormMessage(e.target.value)}
                          placeholder="Tell us about your stay..."
                          className="min-h-28 resize-none bg-white/50 backdrop-blur-sm border-white/40"
                          disabled={submitting}
                        />
                      </div>

                      {submitError ? (
                        <p className="text-sm text-destructive">{submitError}</p>
                      ) : null}

                      <Button
                        type="submit"
                        variant="default"
                        className="w-full active:scale-[0.98]"
                        disabled={submitting}
                      >
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
      )}

      <ChatbotWidget />
    </div>
  );
}
