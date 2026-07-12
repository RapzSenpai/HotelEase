import { Outlet, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const trainingBanner = (
  <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-foreground">
    Training Mode — Sandbox data is stored in{" "}
    <code className="font-mono text-xs">training_*</code> collections.
  </div>
);

export default function AppShell() {
  const { role, trainingMode } = useAuth();
  const location = useLocation();

  const hasSidebar = role === "fo" || role === "admin";
  const isLanding = location.pathname === "/";
  const fullWidthPublicPages = ["/about", "/contact", "/privacy"];
  const isFullWidthPublicPage = fullWidthPublicPages.includes(location.pathname);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="bottom-right" richColors closeButton />
      <Navbar />

      {isLanding ? (
        // Landing page: full-width, no padding, no sidebar
        <main className="min-h-[calc(100vh-64px)]">
          {trainingMode && <div className="px-6 pt-5">{trainingBanner}</div>}
          <Outlet />
        </main>
      ) : (
        // All other pages
        <div
          className={cn(
            "mx-auto flex",
            hasSidebar ? "max-w-7xl" : isFullWidthPublicPage ? "w-full max-w-7xl" : "max-w-5xl",
          )}
        >
          {hasSidebar && <Sidebar />}
          <main className="min-h-[calc(100vh-64px)] w-full flex-1 px-5 py-6 md:px-8 md:py-8">
            {trainingMode && <div className="mb-6">{trainingBanner}</div>}
            <Outlet />
          </main>
        </div>
      )}

      <Footer />
    </div>
  );
}
