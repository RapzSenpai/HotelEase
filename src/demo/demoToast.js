import { toast } from "sonner";

export const DEMO_DISABLED_MESSAGE = "Demo — nothing was saved.";

// Canonical disabled-action feedback for the demo: every demo button that
// would write in prod but has no in-memory effect routes through here, so
// the copy stays identical everywhere and fires exactly once per call.
export default function demoToast(message = DEMO_DISABLED_MESSAGE) {
  toast.info(message);
}
