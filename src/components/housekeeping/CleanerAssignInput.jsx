import { useId, useRef, useState } from "react";
import { CLEANER_ROSTER } from "@/lib/cleaner-roster";

// Compact cleaner-name input: same footprint as the old staff select (h-8).
// Free text always allowed; the roster only offers suggestions.
// Commits on blur or Enter, reverts on Escape. Empty commits clear.
export default function CleanerAssignInput({
  value = "",
  onCommit = () => {},
  placeholder = "Cleaner name",
  ariaLabel = "Assign cleaner",
  autoFocus = false,
}) {
  const [text, setText] = useState(value ?? "");
  const [prevValue, setPrevValue] = useState(value);
  const listId = useId();
  // Marks the Escape path so the blur it triggers never saves the draft.
  const escapeRef = useRef(false);

  // Reset the draft when the stored assignment changes elsewhere.
  if (prevValue !== value) {
    setPrevValue(value);
    setText(value ?? "");
  }

  function commit() {
    // Escape reverts via blur: consume the marker and save nothing.
    if (escapeRef.current) {
      escapeRef.current = false;
      return;
    }
    const next = text.trim();
    if (next !== (value ?? "")) onCommit(next);
  }

  return (
    <>
      <input
        value={text}
        list={CLEANER_ROSTER.length > 0 ? listId : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            escapeRef.current = true;
            setText(value ?? "");
            e.currentTarget.blur();
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className="h-8 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-xs text-foreground shadow-sm transition-colors hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      {CLEANER_ROSTER.length > 0 ? (
        <datalist id={listId}>
          {CLEANER_ROSTER.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}
