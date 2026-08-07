import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TERMS_TITLE, buildTermSections } from "@/lib/termsAndConditions";

/**
 * Reusable Terms & Conditions dialog. Optionally includes a room-specific
 * policy string (from a room's `policies` field) when `extraPolicy` is passed.
 */
export default function TermsDialog({ open, onOpenChange, extraPolicy }) {
  const sections = buildTermSections(extraPolicy);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0">
        <DialogHeader className="pb-3">
          <DialogTitle className="font-playfair text-xl">{TERMS_TITLE}</DialogTitle>
          <p className="text-sm text-foreground/60">
            Please review the terms and policies that apply to your stay.
          </p>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {sections.map((section) => (
            <section key={section.heading}>
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {section.heading}
              </h3>
              {Array.isArray(section.body) ? (
                <ul className="space-y-1.5">
                  {section.body.map((point, i) => (
                    <li key={i} className="flex gap-2 text-sm text-foreground/75 leading-relaxed">
                      <span className="text-primary shrink-0 mt-0.5">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-foreground/75 leading-relaxed whitespace-pre-line">
                  {section.body}
                </p>
              )}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}