import "@testing-library/jest-dom";
import { vi } from "vitest";

vi.mock("@/firebase/firebase.config", () => ({
	auth: {},
	db: {},
	default: {},
}));
