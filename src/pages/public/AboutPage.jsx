import { Target, Eye, Code, Palette, ShieldCheck, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const teamMembers = [
  {
    name: "Loriano Librado Jr.",
    role: "Lead Developer",
    detail: "System architecture, core logic, and full-stack integration",
    icon: Code,
  },
  {
    name: "Maria Sheena Lerio P.",
    role: "Assistant Developer",
    detail: "Feature development, API integration, and testing support",
    icon: Code,
  },
  {
    name: "Lynch Schaeler Mondejar",
    role: "UI/UX Designer",
    detail: "Interface design, user experience, and visual systems",
    icon: Palette,
  },
  {
    name: "Jewel Vincent Borgonia",
    role: "QA Tester",
    detail: "Quality assurance, bug tracking, and regression testing",
    icon: ShieldCheck,
  },
  {
    name: "Kennan John De Guzman",
    role: "QA Tester",
    detail: "Test case development, edge-case identification, and validation",
    icon: ShieldCheck,
  },
];

export default function AboutPage() {
  return (
    <div className="w-full space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-primary/5 px-6 py-14 text-center sm:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,197,24,0.08),transparent_60%)]" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">BSHM-PMS</p>
          <h1 className="mt-3 font-playfair text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Welcome to HotelEase
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-foreground/65">
            HotelEase is the digital Property Management System of the BSHM Department, designed to simulate real
            hotel operations and help students practice reservation, front-office, and guest-service workflows.
          </p>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="grid gap-5 md:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-start gap-4 p-6 pb-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Mission</CardTitle>
              <CardDescription className="mt-0.5">What we commit to every semester</CardDescription>
            </div>
          </div>
          <CardContent className="pt-4 text-sm leading-relaxed text-foreground/70">
            To provide an authentic hotel management experience for BSHM students through a modern, fully functional
            property management system.
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <div className="flex items-start gap-4 p-6 pb-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
              <Eye className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Vision</CardTitle>
              <CardDescription className="mt-0.5">Where HotelEase is headed</CardDescription>
            </div>
          </div>
          <CardContent className="pt-4 text-sm leading-relaxed text-foreground/70">
            To be the leading academic hotel management platform that bridges classroom learning and real-world
            hospitality operations.
          </CardContent>
        </Card>
      </section>

      {/* Team */}
      <section className="space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Meet the Team</h2>
            <p className="text-sm text-foreground/50">The people behind HotelEase</p>
          </div>
        </div>

        {/* Developers & Design */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/40">Development & Design</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teamMembers.slice(0, 3).map((member) => (
              <Card key={member.name} className="group overflow-hidden transition-shadow hover:shadow-md">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <member.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{member.name}</p>
                    <p className="text-xs font-medium text-primary">{member.role}</p>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/55">{member.detail}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* QA */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/40">Quality Assurance</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teamMembers.slice(3, 5).map((member) => (
              <Card key={member.name} className="group overflow-hidden transition-shadow hover:shadow-md">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <member.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{member.name}</p>
                    <p className="text-xs font-medium text-primary">{member.role}</p>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/55">{member.detail}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
