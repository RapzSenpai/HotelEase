import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ScrollToTop() {
  const { pathname } = useLocation();
  const [isVisible, setIsVisible] = useState(false);

  // Auto-scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  // Show button when page is scrolled down > 300px
  const toggleVisibility = useCallback(() => {
    if (window.scrollY > 300) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", toggleVisibility, { passive: true });
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, [toggleVisibility]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <div
      className={cn(
        "fixed bottom-6 left-6 z-40 transition-all duration-300 ease-in-out",
        isVisible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-4 pointer-events-none"
      )}
    >
      <Button
        onClick={scrollToTop}
        size="icon"
        variant="outline"
        aria-label="Back to top"
        title="Back to top"
        className={cn(
          "h-9 w-9 rounded-full shadow-md backdrop-blur-md transition-all duration-200",
          "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border",
          "hover:scale-105 active:scale-95"
        )}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </div>
  );
}
