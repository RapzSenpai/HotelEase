import { Users, UserCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const teamMembers = [
  {
    name: "Mark Anthony Rivera",
    role: "System Developer",
    detail: "Lead developer, BSIT Capstone Team — HotelEase",
  },
  {
    name: "Prof. Maria Lourdes Santos",
    role: "Department Head",
    detail: "BSHM Department, Consolatrix College of Toledo City",
  },
  {
    name: "Engr. James Carlo Mendoza",
    role: "Faculty Adviser",
    detail: "Capstone Project Adviser, College of Information Technology",
  },
];

export default function AboutPage() {
  return (
    <div className="w-full space-y-10">
      <section className="rounded-2xl border border-border bg-muted/10 px-6 py-12 text-center sm:px-10">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-foreground/50">BSHM-PMS</p>
        <h1 className="mt-3 font-playfair text-4xl font-semibold tracking-tight sm:text-5xl">Welcome to HotelEase</h1>
        <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-foreground/70">
          HotelEase is the digital Property Management System of the BSHM Department, designed to simulate real
          hotel operations and help students practice reservation, front-office, and guest-service workflows.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mission</CardTitle>
            <CardDescription>What we commit to every semester.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-foreground/75">
            To provide an authentic hotel management experience for BSHM students through a modern, fully functional
            property management system.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vision</CardTitle>
            <CardDescription>Where HotelEase is headed.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-foreground/75">
            To be the leading academic hotel management platform that bridges classroom learning and real-world
            hospitality operations.
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-semibold">Meet the Team</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teamMembers.map((member) => (
            <Card key={member.role}>
              <CardHeader className="items-center text-center">
                <UserCircle2 className="h-12 w-12 text-foreground/45" />
                <CardTitle className="text-base">{member.name}</CardTitle>
                <CardDescription>{member.role}</CardDescription>
              </CardHeader>
              <CardContent className="text-center text-sm text-foreground/70">
                {member.detail}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
