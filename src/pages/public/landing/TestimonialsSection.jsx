import { useState, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";
import { SectionEyebrow, AmbientGlow, cleanPanel } from "./helpers";

const TestimonialCardItem = memo(function TestimonialCardItem({ testimonial }) {
  const rating = Number(testimonial.rating ?? 5);
  const isHighRating = rating === 5;
  return (
    <div className={`rounded-2xl p-6 md:p-8 border transition-all duration-300 ${isHighRating ? "border-primary/30 bg-primary/5 shadow-[0_2px_12px_rgba(245,197,24,0.05)]" : "border-border/60 bg-white shadow-[0_2px_12px_rgba(28,28,30,0.04)]"}`}>
      <div className="flex items-center justify-between gap-4 mb-4">
        <span className="font-semibold text-sm text-foreground truncate max-w-[150px]">{testimonial.guestName || "Verified Guest"}</span>
        <div className="flex text-primary shrink-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={`h-3 w-3 ${i < rating ? "fill-primary text-primary" : "text-foreground/20"}`} />
          ))}
        </div>
      </div>
      <p className="font-playfair italic text-foreground/85 text-base leading-relaxed tracking-wide pl-1 mt-3">
        &ldquo;{testimonial.message}&rdquo;
      </p>
    </div>
  );
});

export default function TestimonialsSection({ testimonials }) {
  const [visibleCount, setVisibleCount] = useState(4);

  const overallStats = useMemo(() => {
    if (testimonials.length === 0) return { avg: 0, count: 0 };
    const count = testimonials.length;
    const avg = testimonials.reduce((s, t) => s + Number(t.rating ?? 0), 0) / count;
    return { avg, count };
  }, [testimonials]);

  const displayedTestimonials = useMemo(() => testimonials.slice(0, visibleCount), [testimonials, visibleCount]);

  const { leftCol, rightCol } = useMemo(() => {
    const left = [];
    const right = [];
    displayedTestimonials.forEach((t, index) => {
      if (index % 2 === 0) left.push(t);
      else right.push(t);
    });
    return { leftCol: left, rightCol: right };
  }, [displayedTestimonials]);

  const hasMoreToShow = visibleCount < testimonials.length;
  const canShowLess = visibleCount > 4;

  return (
    <section className="relative z-10 py-32 md:py-40 bg-[#FDF8F0] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_10%_30%,rgba(245,197,24,0.02),transparent_50%)] pointer-events-none" />
      <AmbientGlow position="bottom-center" size="lg" intensity={0.10} />
      <AmbientGlow position="mid-right" size="sm" intensity={0.07} />
      <svg className="absolute inset-0 -z-10 h-full w-full pointer-events-none stroke-primary/10 fill-none opacity-25" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M-100,90 C350,270 850,70 1350,170 T2200,90" strokeWidth="0.75" />
        <path d="M-100,120 C350,300 850,100 1350,200 T2200,120" strokeWidth="0.5" strokeDasharray="5 5" />
        <path d="M-100,150 C350,330 850,130 1350,230 T2200,150" strokeWidth="0.5" />
      </svg>
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-8">
            <div className="space-y-4">
              <SectionEyebrow>Guest Reviews</SectionEyebrow>
              <h2 className="font-playfair text-4xl md:text-5xl font-bold tracking-tight text-foreground leading-[1.1]">
                Beloved by <br />Our Guests
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
                  <span className="font-playfair text-5xl font-bold text-foreground leading-none tracking-tight">{overallStats.avg.toFixed(1)}</span>
                  <div className="pb-1"><span className="text-sm text-foreground/40 font-medium block">/ 5.0</span></div>
                </div>
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-4 w-4 ${i < Math.round(overallStats.avg) ? "fill-primary text-primary" : "text-foreground/15"}`} />
                    ))}
                  </div>
                  <p className="text-xs text-foreground/50 font-medium">
                    Based on {overallStats.count} verified guest {overallStats.count === 1 ? "review" : "reviews"}
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="lg:col-span-8">
            {testimonials.length === 0 ? (
              <Card className={`${cleanPanel} p-10 text-center`}>
                <CardContent className="p-0 text-sm text-foreground/55">No reviews yet - be the first to share your experience!</CardContent>
              </Card>
            ) : (
              <Card className={`${cleanPanel} border-0 shadow-none bg-transparent overflow-visible`}>
                <CardContent className="p-0 relative">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <div className="space-y-6">
                      {leftCol.map((t) => <TestimonialCardItem key={t.id} testimonial={t} />)}
                    </div>
                    <div className="space-y-6 md:mt-8">
                      {rightCol.map((t) => <TestimonialCardItem key={t.id} testimonial={t} />)}
                    </div>
                  </div>
                  {(hasMoreToShow || canShowLess) && (
                    <div className={`${hasMoreToShow ? "absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-background via-background/90 to-transparent pointer-events-none" : "mt-8"} flex items-end justify-center pb-2`}>
                      <div className="flex flex-col items-center gap-2 pointer-events-auto">
                        <span className="text-xs text-foreground/45 font-medium">
                          Showing {Math.min(visibleCount, testimonials.length)} of {testimonials.length} reviews
                        </span>
                        <div className="flex gap-2">
                          {canShowLess && (
                            <Button onClick={() => setVisibleCount(4)} variant="ghost" size="sm" className="text-foreground/60 hover:text-foreground active:scale-[0.98]">
                              Show less
                            </Button>
                          )}
                          {hasMoreToShow && (
                            <Button onClick={() => setVisibleCount((prev) => Math.min(prev + 4, testimonials.length))} variant="outline" className="bg-white/80 backdrop-blur-sm border-border shadow-sm hover:bg-white hover:text-foreground active:scale-[0.98]">
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
  );
}
