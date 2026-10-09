import { useState, useCallback } from "react";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import Navbar from "@/components/layout/Navbar";
import DemoPreviewStrip from "@/components/layout/DemoPreviewStrip";
import Sidebar from "@/components/layout/Sidebar";
import Footer from "@/components/layout/Footer";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import ScrollToTop from "@/components/common/ScrollToTop";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import AdminAssistantWidget from "@/components/admin/AdminAssistantWidget";
import "@/components/ui/toast-custom.css";

export default function AppShell() {
  const { user, role, profile, loading } = useAuth();
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleMobileSidebar = useCallback(() => setMobileSidebarOpen((v) => !v), []);
  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);

  // Global email-verification gate: an email/password guest must finish the
  // OTP flow before touching ANY page (Rooms, My Bookings, landing, etc.).
  // Public pages like Rooms are intentionally browsable, so once logged in as
  // an unverified guest we lock them to /verify-email.
  const isUnverifiedGuest =
    !loading &&
    user &&
    !user.isAnonymous &&
    role === "guest" &&
    profile != null &&
    profile.emailVerified === false;

  if (
    isUnverifiedGuest &&
    !location.pathname.startsWith("/verify-email") &&
    !location.pathname.startsWith("/login") &&
    !location.pathname.startsWith("/register")
  ) {
    return <Navigate to="/verify-email" replace state={{ from: location.pathname }} />;
  }

  const hasSidebar = role === "fo" || role === "admin";
  const isLanding = location.pathname === "/";
  const fullWidthPublicPages = ["/about", "/contact", "/privacy"];
  const isFullWidthPublicPage = fullWidthPublicPages.includes(location.pathname);
  // Room detail has a fixed sticky bottom booking bar — footer adds hidden scroll space
  const isRoomDetail = /^\/rooms\/[^/]+$/.test(location.pathname);
  const isFoOrAdmin = hasSidebar || location.pathname.startsWith("/fo") || location.pathname.startsWith("/admin");
  const hideFooter = isRoomDetail || isFoOrAdmin;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Toaster
        position="top-right"
        richColors={false}
        closeButton
        duration={4000}
        gap={10}
        offset={80}
        toastOptions={{
          classNames: {
            toast: "rounded-xl border border-border bg-background text-foreground shadow-lg",
            title: "text-sm font-semibold",
            description: "text-xs text-foreground/55",
            actionButton: "bg-primary text-primary-foreground rounded-lg text-xs font-medium px-3 py-1.5",
            cancelButton: "bg-muted/10 text-foreground/70 rounded-lg text-xs font-medium px-3 py-1.5",
          },
        }}
      />
      <Navbar onToggleSidebar={toggleMobileSidebar} />
      <DemoPreviewStrip />

      {isLanding ? (
        <main className="min-h-[calc(100vh-64px)]">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      ) : (
        <div
          className={cn(
            "mx-auto flex flex-1 w-full",
            hasSidebar ? "max-w-7xl" : isFullWidthPublicPage ? "max-w-7xl" : "max-w-5xl",
          )}
        >
          {hasSidebar && (
            <Sidebar open={mobileSidebarOpen} onClose={closeMobileSidebar} />
          )}
          <main className="flex-1 min-w-0 w-full px-5 py-6 md:px-8 md:py-8">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      )}

      {!hideFooter && <Footer className="mt-auto" />}
      <ScrollToTop />
      {role === "admin" && location.pathname.startsWith("/admin") && <AdminAssistantWidget />}
    </div>
  );
}
