// Page header for demo sections — eyebrow/title/subtitle rhythm copied from
// the production staff pages.
export default function DemoSectionHeader({ label, role, description }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">
        {role === "admin" ? "Administrator" : "Front Office"} · Try Demo
      </p>
      <h1 className="font-playfair text-3xl font-semibold">{label}</h1>
      {description ? <p className="text-sm text-foreground/70">{description}</p> : null}
    </div>
  );
}
