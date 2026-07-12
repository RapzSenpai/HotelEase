import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function Footer() {
  const { role } = useAuth();
  
  // Show these links only to guests or visitors (unauthenticated)
  const showPublicLinks = !role || role === "guest";

  return (
    <footer className="border-t border-border bg-background/50">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-playfair text-base font-semibold text-foreground">
              HotelEase
            </span>
            <span className="text-foreground/25">·</span>
            <span className="text-sm text-foreground/50">
              © 2026 All rights reserved.
            </span>
          </div>

          {showPublicLinks && (
            <nav className="flex items-center gap-6">
              <Link to="/about" className="text-sm text-foreground/50 hover-surface-text">
                About
              </Link>
              <Link to="/contact" className="text-sm text-foreground/50 hover-surface-text">
                Contact
              </Link>
              <Link to="/privacy" className="text-sm text-foreground/50 hover-surface-text">
                Privacy
              </Link>
            </nav>
          )}
        </div>
      </div>
    </footer>
  );
}
