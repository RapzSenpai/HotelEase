import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { SectionEyebrow, AmbientGlow } from "./components";
import image4 from "@/assets/4.jpg";
import image2 from "@/assets/2.jpg";
import image3 from "@/assets/3.jpg";

const FEATURES = [
  {
    title: "Book in a Few Taps",
    desc: "Pick a room, choose your dates, and you're set. No long forms, no waiting. Just a quick reservation and a confirmation right away.",
    image: image4,
    alt: "Hotel room with city view",
  },
  {
    title: "No Hidden Surprises",
    desc: "What you see is what you pay. Your info stays private, every charge is upfront, and your reservation details are always within reach.",
    image: image2,
    alt: "Elegant hotel room interior",
  },
  {
    title: "Day or Night, We're Around",
    desc: "Need extra towels at midnight? Want to extend your stay last minute? Our team is just a message away, whenever you need us.",
    image: image3,
    alt: "Hotel amenities and services",
  },
];

function FeatureRow({ feature, index }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const isReversed = index % 2 !== 0;

  return (
    <div ref={ref} className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
      {/* Image side */}
      <motion.div
        className={`lg:col-span-6 ${isReversed ? "lg:order-2" : "lg:order-1"}`}
        initial={{ opacity: 0, x: isReversed ? 60 : -60 }}
        animate={isInView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={`relative ${isReversed ? "lg:ml-8" : "lg:mr-8"}`}>
          {/* Offset decorative frame behind the image */}
          <div
            className={`absolute -top-3 ${isReversed ? "-left-3" : "-right-3"} h-full w-full rounded-2xl border border-primary/20 bg-primary/5`}
            aria-hidden="true"
          />
          <div className="relative overflow-hidden rounded-2xl border border-border/40 shadow-[0_8px_40px_rgba(28,28,30,0.1)]">
            <img
              src={feature.image}
              alt={feature.alt}
              className="h-[280px] sm:h-[340px] lg:h-[400px] w-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
          </div>
        </div>
      </motion.div>

      {/* Text side */}
      <motion.div
        className={`lg:col-span-6 ${isReversed ? "lg:order-1" : "lg:order-2"}`}
        initial={{ opacity: 0, x: isReversed ? -40 : 40 }}
        animate={isInView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={`space-y-5 ${isReversed ? "lg:pr-8" : "lg:pl-8"}`}>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              0{index + 1}
            </span>
          </div>
          <h3 className="font-playfair text-3xl md:text-4xl font-bold tracking-tight text-foreground leading-[1.1]">
            {feature.title}
          </h3>
          <p className="text-foreground/60 leading-relaxed text-base max-w-md">
            {feature.desc}
          </p>
          <div className="h-px w-12 bg-gradient-to-r from-primary/40 to-transparent" />
        </div>
      </motion.div>
    </div>
  );
}

function FeatureHighlight({ feature }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <div ref={ref}>
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-border/40 shadow-[0_8px_40px_rgba(28,28,30,0.1)]"
        initial={{ opacity: 0, y: 40 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <img
          src={feature.image}
          alt={feature.alt}
          className="h-[300px] sm:h-[380px] lg:h-[440px] w-full object-cover"
          loading="lazy"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        {/* Content overlay */}
        <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-10 lg:p-12">
          <motion.div
            className="max-w-lg space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/90">
                03
              </span>
            </div>
            <h3 className="font-playfair text-3xl md:text-4xl font-bold tracking-tight text-white leading-[1.1]">
              {feature.title}
            </h3>
            <p className="text-white/75 leading-relaxed text-base max-w-md">
              {feature.desc}
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

export default function FeaturesSection() {
  const headerRef = useRef(null);
  const headerInView = useInView(headerRef, { once: true, margin: "-60px" });

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
        {/* Header */}
        <motion.div
          ref={headerRef}
          className="mb-20 max-w-2xl space-y-4"
          initial={{ opacity: 0, y: 30 }}
          animate={headerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <SectionEyebrow>Why HotelEase</SectionEyebrow>
          <h2 className="font-playfair text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            Everything You Need
          </h2>
          <p className="text-foreground/55 text-lg leading-relaxed">
            Built for guests who want things to just work.
          </p>
        </motion.div>

        {/* Feature rows */}
        <div className="space-y-24 lg:space-y-32">
          {/* Row 1: Image left, text right */}
          <FeatureRow feature={FEATURES[0]} index={0} />

          {/* Row 2: Text left, image right */}
          <FeatureRow feature={FEATURES[1]} index={1} />

          {/* Row 3: Full-width photo with overlay text */}
          <FeatureHighlight feature={FEATURES[2]} />
        </div>
      </div>
    </section>
  );
}
