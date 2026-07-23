import hotelLogo from "@/assets/Hotellogo.png";
import cctcLogo from "@/assets/logocctc.png";
import { SectionEyebrow, AmbientGlow, LayeredLogoBadge } from "./helpers";

export default function PartnershipSection() {
  return (
    <section className="relative z-10 py-32 md:py-40 bg-background overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(245,197,24,0.03),transparent_65%)] pointer-events-none" />
      <AmbientGlow position="top-left" size="lg" intensity={0.10} />
      <AmbientGlow position="bottom-right" size="md" intensity={0.08} />
      <svg className="absolute inset-0 -z-10 h-full w-full pointer-events-none stroke-border/20 fill-none opacity-30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M2100,90 C1600,230 1100,40 600,180 T-100,90" strokeWidth="0.75" />
        <path d="M2100,120 C1600,260 1100,70 600,210 T-100,120" strokeWidth="0.5" strokeDasharray="4 4" />
        <path d="M2100,150 C1600,290 1100,100 600,240 T-100,150" strokeWidth="0.5" />
      </svg>
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="mb-6">
            <SectionEyebrow>Capstone Project</SectionEyebrow>
          </div>
          <h2 className="font-playfair text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-6">
            Academic Collaboration
          </h2>
          <p className="text-lg text-foreground/70 leading-relaxed max-w-2xl mx-auto">
            HotelEase is a capstone project developed by Information Technology students at Consolatrix College of Toledo City, bringing modern hotel management to Consolatrix Suites with seamless booking and guest services.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center max-w-4xl mx-auto">
          <div className="flex flex-col items-center text-center space-y-6">
            <LayeredLogoBadge src={hotelLogo} alt="HotelEase" />
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground text-lg">HotelEase</h3>
              <p className="text-sm text-foreground/60">Capstone Project</p>
            </div>
          </div>
          <div className="flex flex-col items-center text-center space-y-6">
            <LayeredLogoBadge src={cctcLogo} alt="Consolatrix College of Toledo City" logoSize={95} />
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground text-lg">Consolatrix College</h3>
              <p className="text-sm text-foreground/60">Toledo City, Philippines</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
