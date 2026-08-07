import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { 
  subscribeToNotifications, 
  markAsRead, 
  markAllAsRead 
} from "@/services/notificationService";
import { subscribeToPendingBookingRequests } from "@/services/bookingsService";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, Check, X, CalendarCheck, CalendarX, CheckCircle, Navigation, Info, BellRing, Sparkles, MessageSquareMore } from "lucide-react";

function getNotifIcon(type) {
  switch (type) {
    case "booking_request":
      return <CalendarCheck className="h-4 w-4 text-primary" />;
    case "booking_approved":
      return <CheckCircle className="h-4 w-4 text-success" />;
    case "booking_rejected":
    case "booking_cancelled":
      return <CalendarX className="h-4 w-4 text-destructive" />;
    case "room_dirty":
      return <Sparkles className="h-4 w-4 text-info" />;
    case "announcement":
      return <BellRing className="h-4 w-4 text-warning" />;
    case "support_message":
      return <MessageSquareMore className="h-4 w-4 text-info" />;
    default:
      return <Info className="h-4 w-4 text-muted-foreground" />;
  }
}

function timeSince(dateLike) {
  if (!dateLike) return "Just now";
  const date = dateLike.toDate ? dateLike.toDate() : new Date(dateLike);
  if (isNaN(date)) return "Just now";
  
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " yr ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " mo ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " d ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hr ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " min ago";
  return "Just now";
}

export default function NotificationBell() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToNotifications(user.uid, (data) => {
      setNotifications(data);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || role !== "fo") return;
    const unsub = subscribeToPendingBookingRequests((data) => {
      setPendingRequests(data);
    });
    return () => unsub();
  }, [user?.uid, role]);

  const foRequestNotifications =
    role === "fo"
      ? pendingRequests.map((booking) => ({
          id: `booking-request-${booking.id}`,
          type: "booking_request",
          title: "New Booking Request",
          message: "A guest submitted a new booking request.",
          link: "/fo/bookings",
          isRead: false,
          createdAt: booking.createdAt,
          isSystemRequest: true,
        }))
      : [];

  const allNotifications = [...foRequestNotifications, ...notifications]
    .sort((a, b) => {
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 20);

  const unreadCount = allNotifications.filter(n => !n.isRead).length;
  const unreadStoredCount = notifications.filter((n) => !n.isRead).length;

  const handleNotifClick = async (notif) => {
    if (!notif.isRead && !notif.isSystemRequest) {
      await markAsRead(user.uid, notif.id);
    }
    setIsOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadStoredCount === 0) return;
    await markAllAsRead(user.uid);
  };

  if (!user) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40">
          <Bell className="h-[1.15rem] w-[1.15rem] text-foreground/80" />
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive/90 shadow-sm border border-background">
              <span className="absolute inset-0 rounded-full animate-ping opacity-75 bg-destructive"></span>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 shadow-xl border border-border bg-white"
        align="end"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/5">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        
        <div className="max-h-[300px] overflow-y-auto">
          {allNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <span className="text-3xl mb-2">🎉</span>
              <p className="text-sm font-medium">You're all caught up!</p>
              <p className="text-xs text-foreground/50 mt-1">No new notifications.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {allNotifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={`text-left p-4 border-b border-border/40 transition-colors hover:bg-surface-hover focus:outline-none group ${
                    !notif.isRead ? "bg-primary/5 border-l-2 border-l-primary/60 pr-4 pl-3.5" : ""
                  }`}
                >
                  <div className="flex gap-3 items-start">
                    <div className="shrink-0 mt-0.5 bg-background p-1.5 rounded-md border border-border/40 group-hover:bg-background/80 transition-colors flex items-center justify-center h-8 w-8">
                      {getNotifIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm ${!notif.isRead ? "font-semibold" : "font-medium"}`}>
                          {notif.title}
                        </p>
                        <span className="text-[10px] text-foreground/40 shrink-0 tabular-nums">
                          {timeSince(notif.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/60 leading-snug line-clamp-2">
                        {notif.message}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/5">
          <button 
            type="button"
            onClick={handleMarkAllRead}
            disabled={unreadStoredCount === 0 || notifications.length === 0}
            className="text-xs font-medium text-foreground/60 hover:text-foreground/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Mark all read
          </button>
          
          <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs px-2 py-1">
            <NavLink to="/notifications" onClick={() => setIsOpen(false)}>
              See all
            </NavLink>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
