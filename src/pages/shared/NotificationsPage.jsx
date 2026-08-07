import { useState, useEffect, useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getLogoHomePath, isStaffRole } from "@/lib/routing";
import { 
  collection,
  query,
  orderBy,
  onSnapshot
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { markAsRead, markAllAsRead } from "@/services/notificationService";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { Bell, CalendarCheck, CalendarX, CheckCircle, Info, BellRing, Sparkles, Check, Trash2, MessageSquareMore } from "lucide-react";

function getNotifIcon(type) {
  switch (type) {
    case "booking_request":
      return <CalendarCheck className="h-5 w-5 text-primary" />;
    case "booking_approved":
      return <CheckCircle className="h-5 w-5 text-success" />;
    case "booking_rejected":
    case "booking_cancelled":
      return <CalendarX className="h-5 w-5 text-destructive" />;
    case "room_dirty":
      return <Sparkles className="h-5 w-5 text-info" />;
    case "announcement":
      return <BellRing className="h-5 w-5 text-warning" />;
    case "support_message":
      return <MessageSquareMore className="h-5 w-5 text-info" />;
    default:
      return <Info className="h-5 w-5 text-muted-foreground" />;
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

function groupNotifications(notifs) {
  const groups = {
    Today: [],
    Yesterday: [],
    Earlier: []
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  notifs.forEach(notif => {
    if (!notif.createdAt) {
      groups.Earlier.push(notif);
      return;
    }
    const d = notif.createdAt.toDate ? notif.createdAt.toDate() : new Date(notif.createdAt);
    if (isNaN(d)) {
      groups.Earlier.push(notif);
      return;
    }
    
    if (d >= today) {
      groups.Today.push(notif);
    } else if (d >= yesterday) {
      groups.Yesterday.push(notif);
    } else {
      groups.Earlier.push(notif);
    }
  });

  return groups;
}

export default function NotificationsPage() {
  const { user, role } = useAuth();
  const homePath = getLogoHomePath(role);
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Clear loading when the authenticated user goes away (during render, not the
  // effect) so the "sign in" empty state shows instead of an endless spinner.
  const [prevUid, setPrevUid] = useState(user?.uid);
  if (prevUid !== user?.uid) {
    setPrevUid(user?.uid);
    if (!user?.uid) setLoading(false);
  }

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, "notifications", user.uid, "items"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setNotifications(data);
        setLoading(false);
      },
      (error) => {
        console.error("[NotificationsPage] onSnapshot error:", error);
        setNotifications([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user?.uid]);

  const { Today, Yesterday, Earlier } = useMemo(() => groupNotifications(notifications), [notifications]);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleNotifClick = async (notif) => {
    if (!notif.isRead) {
      await markAsRead(user.uid, notif.id);
    }
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    await markAllAsRead(user.uid);
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-playfair text-3xl font-semibold">Notifications</h1>
          <p className="text-foreground/60">
            Stay updated with your latest alerts and messages.
          </p>
        </div>
        
        {notifications.length > 0 && (
          <Button 
            onClick={handleMarkAllRead} 
            variant="outline" 
            size="sm"
            disabled={unreadCount === 0}
            className="shrink-0"
          >
            <Check className="h-4 w-4 mr-2" />
            Mark all as read
          </Button>
        )}
      </div>

      {loading ? (
        <SkeletonList rows={4} className="mt-8" />
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-full bg-muted/20 flex items-center justify-center mb-4">
            <Bell className="h-8 w-8 text-foreground/20" />
          </div>
          <h2 className="text-xl font-medium mb-2">You're all caught up!</h2>
          <p className="text-foreground/60 text-sm max-w-sm mb-6">
            When you receive new updates, alerts, or messages, they will appear here.
          </p>
          <Button asChild variant="default">
            <NavLink to={homePath}>
              {isStaffRole(role) ? "Go to Dashboard" : "Go Home"}
            </NavLink>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {Today.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/50 ml-1">Today</h3>
              <div className="rounded-xl border border-border bg-background overflow-hidden shadow-sm">
                {Today.map(notif => <NotificationItem key={notif.id} notif={notif} onClick={handleNotifClick} />)}
              </div>
            </div>
          )}
          
          {Yesterday.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/50 ml-1">Yesterday</h3>
              <div className="rounded-xl border border-border bg-background overflow-hidden shadow-sm">
                {Yesterday.map(notif => <NotificationItem key={notif.id} notif={notif} onClick={handleNotifClick} />)}
              </div>
            </div>
          )}

          {Earlier.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/50 ml-1">Earlier</h3>
              <div className="rounded-xl border border-border bg-background overflow-hidden shadow-sm">
                {Earlier.map(notif => <NotificationItem key={notif.id} notif={notif} onClick={handleNotifClick} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationItem({ notif, onClick }) {
  return (
    <button
      onClick={() => onClick(notif)}
      className={`w-full text-left p-4 sm:p-5 flex items-start gap-4 border-b border-border/40 last:border-b-0 transition-colors hover:bg-surface-hover focus:outline-none focus:bg-surface-hover ${
        !notif.isRead ? "bg-primary/5 hover:bg-primary/[0.07]" : ""
      }`}
    >
      <div className={`shrink-0 p-2 sm:p-2.5 rounded-full border border-border/40 ${!notif.isRead ? "bg-background shadow-sm" : "bg-muted/20"}`}>
        {getNotifIcon(notif.type)}
      </div>
      
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-1">
          <h4 className={`text-base ${!notif.isRead ? "font-semibold" : "font-medium text-foreground/90"}`}>
            {notif.title}
          </h4>
          <span className="text-xs text-foreground/50 tabular-nums whitespace-nowrap hidden sm:inline-block">
            {timeSince(notif.createdAt)}
          </span>
        </div>
        <p className="text-sm text-foreground/70 leading-relaxed pr-8">
          {notif.message}
        </p>
        <span className="text-xs text-foreground/50 tabular-nums sm:hidden mt-2 inline-block">
          {timeSince(notif.createdAt)}
        </span>
      </div>
      
      {!notif.isRead && (
        <div className="shrink-0 pt-2 self-center sm:self-start">
          <div className="h-2.5 w-2.5 rounded-full bg-primary" />
        </div>
      )}
    </button>
  );
}
