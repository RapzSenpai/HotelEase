import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Image } from "lucide-react";
import { SectionEyebrow, AmbientGlow } from "./components";
import { cleanPanel, formatDate } from "./helpers";
import { optimizeCloudinaryUrl } from "@/lib/cloudinaryTransform";

export default function AnnouncementsSection({ announcements, announcementsLoading, announcementsError }) {
  return (
    <section className="relative z-10 py-32 md:py-40 bg-background overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_100%_0%,rgba(245,197,24,0.02),transparent_60%)] pointer-events-none" />
      <AmbientGlow position="top-left" size="md" intensity={0.10} />
      <AmbientGlow position="mid-right" size="sm" intensity={0.08} />
      <svg className="absolute inset-0 -z-10 h-full w-full pointer-events-none stroke-border/20 fill-none opacity-30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M2100,140 C1600,280 1100,40 600,180 T-100,140" strokeWidth="0.75" />
        <path d="M2100,170 C1600,310 1100,70 600,210 T-100,170" strokeWidth="0.5" />
        <path d="M2100,200 C1600,340 1100,100 600,240 T-100,200" strokeWidth="0.5" strokeDasharray="4 4" />
      </svg>
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-14 space-y-4 max-w-2xl">
          <SectionEyebrow>News & Events</SectionEyebrow>
          <h2 className="font-playfair text-4xl md:text-5xl font-bold tracking-tight">Latest Announcements</h2>
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
              return (
                <Card
                  key={a.id}
                  className={`group overflow-hidden border-border/60 bg-gradient-to-br from-primary/5 to-primary/[0.02] shadow-[0_2px_20px_rgba(28,28,30,0.04)] hover:shadow-[0_4px_28px_rgba(28,28,30,0.08)] transition-all duration-300 ease-out rounded-2xl ${isFeatured ? "md:col-span-7" : "md:col-span-5"}`}
                >
                  {a.imageUrl ? (
                    <div className={`overflow-hidden ${isFeatured ? "h-64 md:h-72" : "h-56"}`}>
                      <img src={optimizeCloudinaryUrl(a.imageUrl, { width: 800 })} alt={a.title} className="h-full w-full object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]" loading="lazy" />
                    </div>
                  ) : (
                    <div className={`overflow-hidden ${isFeatured ? "h-64 md:h-72" : "h-56"} flex items-center justify-center bg-primary/5 rounded-2xl`}>
                      <Image className="h-8 w-8 text-primary/30" />
                    </div>
                  )}
                  <CardHeader className={`space-y-2 ${isFeatured ? "p-4 md:p-5" : "p-3 md:p-4"}`}>
                    <Badge variant="muted" className="w-fit rounded-full text-[11px] uppercase tracking-wide">{formatDate(a.date)}</Badge>
                    <CardTitle className={`font-playfair leading-snug ${isFeatured ? "text-lg md:text-xl" : "text-base md:text-lg"}`}>{a.title}</CardTitle>
                    <CardDescription className={`leading-relaxed ${isFeatured ? "text-sm line-clamp-4" : "text-sm line-clamp-3"}`}>{a.description}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
