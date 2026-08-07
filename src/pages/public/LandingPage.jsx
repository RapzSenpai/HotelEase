import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { listAnnouncements } from "@/services/announcementsService";
import { mapFirebaseError } from "@/lib/errors";
import { subscribeToRooms } from "@/services/roomsService";
import { listReviewsForRoom } from "@/services/reviewsService";
import { subscribeToApprovedTestimonials } from "@/services/testimonialsService";
import { useAuth } from "@/contexts/AuthContext";
import { getHomePathForRole, isStaffRole } from "@/lib/routing";
import ChatbotWidget from "@/components/chatbot/ChatbotWidget";
import { SectionDivider } from "./landing/components";
import HeroSection from "./landing/HeroSection";
import PartnershipSection from "./landing/PartnershipSection";
import RoomShowcaseSection from "./landing/RoomShowcaseSection";
import FeaturesSection from "./landing/FeaturesSection";
import TestimonialsSection from "./landing/TestimonialsSection";
import AnnouncementsSection from "./landing/AnnouncementsSection";
import ReviewFormSection from "./landing/ReviewFormSection";

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, role, profile, loading } = useAuth();

  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [announcementsError, setAnnouncementsError] = useState(null);

  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomRatings, setRoomRatings] = useState({});

  const [testimonials, setTestimonials] = useState([]);

  const showcaseRooms = useMemo(() => {
    return rooms
      .filter((r) => r.isActive !== false)
      .sort((a, b) => (b.status === "Available" ? 1 : 0) - (a.status === "Available" ? 1 : 0))
      .slice(0, 3);
  }, [rooms]);

  const handleViewRoom = useCallback(
    (roomId) => navigate(user ? `/rooms/${roomId}` : "/rooms"),
    [navigate, user],
  );

  const handleBookRoom = useCallback(
    (roomId) => {
      if (isStaffRole(role)) return navigate(`/rooms/${roomId}`);
      if (user && role === "guest") return navigate(`/booking/${roomId}`);
      navigate("/login");
    },
    [navigate, user, role],
  );

  const isGuest = Boolean(user && role === "guest");
  const isStaff = isStaffRole(role);
  const canBookRooms = !user || isGuest;
  const staffDashboardPath = getHomePathForRole(role);

  useEffect(() => {
    let isMounted = true;
    listAnnouncements({ limitCount: 6 })
      .then((data) => { if (isMounted) { setAnnouncements(data); setAnnouncementsLoading(false); } })
      .catch((e) => { if (isMounted) { setAnnouncementsError(mapFirebaseError(e) || "Failed to load announcements."); setAnnouncementsLoading(false); } });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let settled = false;
    const unsub = subscribeToRooms((data) => {
      setRooms(data);
      if (!settled) { settled = true; setRoomsLoading(false); }
    });
    return () => { if (typeof unsub === "function") unsub(); };
  }, []);

  useEffect(() => {
    const unsub = subscribeToApprovedTestimonials((data) => setTestimonials(data));
    return () => { if (typeof unsub === "function") unsub(); };
  }, []);

  useEffect(() => {
    if (showcaseRooms.length === 0) return;
    let isMounted = true;
    async function fetchRatings() {
      const entries = await Promise.all(
        showcaseRooms.map(async (room) => {
          try {
            const reviews = await listReviewsForRoom(room.id);
            const count = reviews.length;
            const avg = count > 0 ? reviews.reduce((s, r) => s + Number(r.rating ?? 0), 0) / count : 0;
            return [room.id, { avg, count }];
          } catch { return [room.id, { avg: 0, count: 0 }]; }
        }),
      );
      if (isMounted) setRoomRatings(Object.fromEntries(entries));
    }
    fetchRatings();
    return () => { isMounted = false; };
  }, [showcaseRooms]);

  if (!loading && user && isStaffRole(role)) {
    return <Navigate to={getHomePathForRole(role)} replace />;
  }

  return (
    <div className="overflow-x-hidden">
      <HeroSection user={user} isStaff={isStaff} staffDashboardPath={staffDashboardPath} />
      <SectionDivider />
      <PartnershipSection />
      <SectionDivider />
      <RoomShowcaseSection
        showcaseRooms={showcaseRooms}
        roomsLoading={roomsLoading}
        roomRatings={roomRatings}
        canBookRooms={canBookRooms}
        handleViewRoom={handleViewRoom}
        handleBookRoom={handleBookRoom}
      />
      <SectionDivider />
      <FeaturesSection />
      <SectionDivider />
      <TestimonialsSection testimonials={testimonials} />
      <SectionDivider />
      <AnnouncementsSection
        announcements={announcements}
        announcementsLoading={announcementsLoading}
        announcementsError={announcementsError}
      />
      {!isStaff && (
        <>
          <SectionDivider />
          <ReviewFormSection isGuest={isGuest} user={user} profile={profile} />
        </>
      )}
      <ChatbotWidget />
    </div>
  );
}
