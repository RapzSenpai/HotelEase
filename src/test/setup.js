import "@testing-library/jest-dom";
import { vi } from "vitest";

// jsdom has no matchMedia; page-mascot (fox FAB) reads only `.matches`.
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
}
// jsdom lacks the Web Animations API; the mascot boop calls Element.animate.
if (!Element.prototype.animate) {
  Element.prototype.animate = () => ({ cancel: () => {}, finished: Promise.resolve() });
}

vi.mock("@/firebase/firebase.config", () => ({
	auth: {},
	db: {},
	default: {},
}));
