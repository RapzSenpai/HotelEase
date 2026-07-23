import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { SectionEyebrow, AmbientGlow, FEATURES, BENTO_FEATURE_LAYOUT } from "./helpers";

export default function FeaturesSection() {
  return (
    <section className="relative z-10 py-32 md:py-40 bg-background overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(245,197,24,0.04),transparent_70%)] pointer-events-none" />
      <AmbientGlow position="top-right" size="md" intensity={0.10} />
      <AmbientGlow position="bottom-left" size="sm" intensity={0.08} />
      <svg className="absolute inset-0 -z-10 h-full w-full pointer-events-none stroke-border/20 fill-none opacity-30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M2100,280 C1500,80 900,380 300,180 T-100,280" strokeWidth="0.75" />
        <path d="M2100,310 C1500,110 900,410 300,210 T-100,310" strokeWidth="0.5" />
        <path d="M2100,340 C1500,140 900,440 300,240 T-100,340" strokeWidth="0.5" strokeDasharray="4 4" />
      </svg>
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mb-16 max-w-2xl space-y-4">
          <SectionEyebrow>Why HotelEase</SectionEyebrow>
          <h2 className="font-playfair text-4xl md:text-5xl font-bold tracking-tight text-foreground">Everything You Need</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
          {FEATURES.map((f, index) => {
            const Icon = f.icon;
            const layout = BENTO_FEATURE_LAYOUT[index] ?? "compact";
            const isWide = layout === "wide";
            return (
              <Card
                key={f.title}
                className={`border-border/60 bg-white shadow-[0_2px_20px_rgba(28,28,30,0.06)] ${isWide ? "md:col-span-7 p-7 md:p-8" : "md:col-span-5 p-6 md:p-7"}`}
              >
                <CardContent className="p-0 flex flex-col gap-5 h-full">
                  <div className={`flex items-center justify-center rounded-xl border border-primary/10 bg-gradient-to-br from-primary/5 to-primary/[0.02] ${isWide ? "h-16 w-16" : "h-14 w-14"}`}>
                    <Icon className={`text-primary ${isWide ? "h-8 w-8" : "h-7 w-7"}`} />
                  </div>
                  <div className="space-y-2.5 flex-1">
                    <CardTitle className={`font-playfair text-foreground ${isWide ? "text-2xl md:text-3xl" : "text-xl"}`}>
                      {f.title}
                    </CardTitle>
                    <CardDescription className={`text-foreground/60 leading-relaxed ${isWide ? "text-base max-w-lg" : "text-sm"}`}>
                      {f.desc}
                    </CardDescription>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
