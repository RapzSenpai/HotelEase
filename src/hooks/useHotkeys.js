import { useEffect } from "react";

function isTypingTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * Register keyboard shortcuts. Keys are lowercase single characters.
 * Handlers are skipped when focus is in an input/textarea.
 */
export function useHotkeys(hotkeys, { enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
        return;
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const handler = hotkeys[key];
      if (handler) {
        event.preventDefault();
        handler(event);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, hotkeys]);
}
