/**
 * Shared hero band for static/info pages (About, Privacy, Contact).
 * One source of truth for the eyebrow + playfair title + subtitle pattern
 * so sibling pages keep the same header treatment.
 */
export default function PageHero({ eyebrow, title, subtitle, children }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-primary/5 px-6 py-12 text-center sm:px-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,197,24,0.08),transparent_60%)]" />
      <div className="relative space-y-3">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="font-playfair text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-foreground/65">
            {subtitle}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}
