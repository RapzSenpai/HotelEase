import { useTypewriter } from "@/hooks/useTypewriter";
import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import heroBg from "@/assets/background.png";
import background2 from "@/assets/background2.jpg";
import image2 from "@/assets/2.jpg";
import image3 from "@/assets/3.jpg";
import image4 from "@/assets/4.jpg";
import image5 from "@/assets/5.jpg";
import { SectionEyebrow } from "./components";
import {
  DraggableCardContainer,
  DraggableCardBody,
} from "@/components/ui/draggable-card";

export default function HeroSection({ user, isStaff, staffDashboardPath }) {
  const { word: changingWord } = useTypewriter(
    ["Redefined", "Elevated", "Refined", "Timeless"],
    80,
    40,
    2500
  );

  return (
    <section className="relative z-10 flex min-h-[90dvh] items-center overflow-hidden">
      <div className="absolute inset-0 -z-20 pointer-events-none overflow-hidden">
        <img
          src={background2}
          alt=""
          className="h-full w-full object-cover object-center opacity-[0.38] mix-blend-multiply filter brightness-[1.02]"
        />
      </div>
      <div className="absolute top-12 left-1/4 -z-10 h-64 w-64 rounded-full bg-primary/18 blur-[65px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 -z-10 h-56 w-56 rounded-full bg-primary/12 blur-[60px] pointer-events-none" />
      <div className="absolute top-1/2 right-12 -z-10 h-48 w-48 rounded-full bg-primary/10 blur-[55px] pointer-events-none" />
      <svg className="absolute inset-0 -z-10 h-full w-full pointer-events-none stroke-border/25 fill-none opacity-50" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M-100,180 C350,110 650,290 1050,130 T2200,210" strokeWidth="0.8" />
        <path d="M-100,210 C350,140 650,320 1050,160 T2200,240" strokeWidth="0.5" strokeDasharray="3 3" />
        <path d="M-100,240 C350,170 650,350 1050,190 T2200,270" strokeWidth="0.75" />
        <path d="M-100,270 C350,200 650,380 1050,220 T2200,300" strokeWidth="0.5" />
      </svg>
      <div className="absolute inset-0 -z-10 pointer-events-none bg-gradient-to-b from-background/30 via-background/70 to-background" aria-hidden="true" />
      <div className="mx-auto w-full max-w-7xl px-6 py-4 md:py-6">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
          <div className="lg:col-span-6 space-y-8">
            <SectionEyebrow>Consolatrix Suites, Toledo City</SectionEyebrow>
            <h1 className="font-playfair text-[2.75rem] font-bold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl text-foreground max-w-2xl">
              Experience Comfort,
              <br />
              <span className="text-primary" style={{ textShadow: "0 0 30px rgba(245, 197, 24, 0.4), 0 0 60px rgba(245, 197, 24, 0.2)" }}>
                {changingWord}
                <span className="inline-block w-0.5 h-1 ml-1 align-middle bg-primary animate-pulse" />
              </span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-foreground/80">
              Welcome to HotelEase — where every detail is taken care of. Browse our rooms, make a reservation, and enjoy a stay that feels effortlessly perfect.
            </p>
            <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" variant="default" className="gap-2 px-7 shadow-md active:scale-[0.98]">
                  <NavLink to="/rooms">
                    Browse Rooms
                    <ArrowRight className="h-4 w-4" />
                  </NavLink>
                </Button>
                {!user ? (
                  <Button asChild size="lg" variant="outline" className="bg-white/50 backdrop-blur-sm border-white/40 active:scale-[0.98]">
                    <NavLink to="/login">Sign In</NavLink>
                  </Button>
                ) : isStaff ? (
                  <Button asChild size="lg" variant="outline" className="bg-white/50 backdrop-blur-sm border-white/40 active:scale-[0.98]">
                    <NavLink to={staffDashboardPath}>
                      Go to Dashboard
                      <ArrowRight className="h-4 w-4" />
                    </NavLink>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="lg:col-span-6 w-full flex justify-center lg:justify-end">
            <div className="grid grid-cols-2 gap-3 h-[420px] sm:h-[480px] md:hidden w-full max-w-2xl">
              <div className="col-span-2 rounded-[2rem] overflow-hidden shadow-lg border border-border/10">
                <img src={heroBg} alt="Consolatrix Suites" className="h-full w-full object-cover" />
              </div>
              <div className="rounded-[2rem] overflow-hidden shadow-md border border-border/10">
                <img src={image2} alt="Hotel Interior" className="h-full w-full object-cover" />
              </div>
              <div className="rounded-[2rem] overflow-hidden shadow-md border border-border/10">
                <img src={image4} alt="Room View" className="h-full w-full object-cover" />
              </div>
            </div>
            <div className="hidden md:block w-full max-w-3xl">
              <DraggableCardContainer className="h-[680px] w-full">
                <DraggableCardBody index={0} className="absolute top-[5%] left-[10%] rotate-[-2deg] h-[320px] w-[300px] rounded-[2rem] border border-border/10">
                  <img src={heroBg} alt="Consolatrix Suites" className="pointer-events-none relative z-10 h-full w-full object-cover rounded-[2rem]" />
                </DraggableCardBody>
                <DraggableCardBody index={1} className="absolute top-[8%] left-[40%] rotate-[5deg] h-[280px] w-[260px] rounded-[2rem] border border-border/10">
                  <img src={image2} alt="Hotel Interior" className="pointer-events-none relative z-10 h-full w-full object-cover rounded-[2rem]" />
                </DraggableCardBody>
                <DraggableCardBody index={2} className="absolute top-[35%] left-[22%] rotate-[-4deg] h-[240px] w-[220px] rounded-[2rem] border border-border/10">
                  <img src={image3} alt="Hotel Amenities" className="pointer-events-none relative z-10 h-full w-full object-cover rounded-[2rem]" />
                </DraggableCardBody>
                <DraggableCardBody index={3} className="absolute top-[50%] left-[3%] rotate-[3deg] h-[260px] w-[240px] rounded-[2rem] border border-border/10">
                  <img src={image4} alt="Room View" className="pointer-events-none relative z-10 h-full w-full object-cover rounded-[2rem]" />
                </DraggableCardBody>
                <DraggableCardBody index={4} className="absolute top-[42%] left-[45%] rotate-[-3deg] h-[280px] w-[260px] rounded-[2rem] border border-border/10">
                  <img src={image5} alt="Dining Area" className="pointer-events-none relative z-10 h-full w-full object-cover rounded-[2rem]" />
                </DraggableCardBody>
              </DraggableCardContainer>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
