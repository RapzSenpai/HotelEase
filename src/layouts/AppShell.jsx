import { useState, useCallback } from "react";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";
import Footer from "@/components/layout/Footer";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import ScrollToTop from "@/components/common/ScrollToTop";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import "@/components/ui/toast-custom.css";

const trainingBanner = (
  <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-foreground">
    Training Mode — Sandbox data is stored in{" "}
    <code className="font-mono text-xs">training_*</code> collections.
  </div>
);

export default function AppShell() {
  const { user, role, profile, loading, trainingMode } = useAuth();
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

  return (
    <div className="min-h-screen bg-background text-foreground">
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

      {isLanding ? (
        <main className="min-h-[calc(100vh-64px)]">
          {trainingMode && <div className="px-6 pt-5">{trainingBanner}</div>}
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      ) : (
        <div
          className={cn(
            "mx-auto flex",
            hasSidebar ? "max-w-7xl" : isFullWidthPublicPage ? "w-full max-w-7xl" : "max-w-5xl",
          )}
        >
          {hasSidebar && (
            <Sidebar open={mobileSidebarOpen} onClose={closeMobileSidebar} />
          )}
          <main className="min-h-[calc(100vh-64px)] w-full flex-1 px-5 py-6 md:px-8 md:py-8">
            {trainingMode && <div className="mb-6">{trainingBanner}</div>}
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      )}

      <Footer />
      <ScrollToTop />
    </div>
  );
}
