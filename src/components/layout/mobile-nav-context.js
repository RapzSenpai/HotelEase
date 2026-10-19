import { createContext, useContext } from "react";

/**
 * Mobile sidebar drawer state owned by AppShell. The staff Sidebar and the
 * Try Demo DemoSidebar render the same drawer, but only one per route, and the
 * drawer state lives above both (the Navbar toggle and the Outlet children
 * cannot share props).
 */
export const MobileNavContext = createContext({ open: false, onClose: () => {} });

export const useMobileNav = () => useContext(MobileNavContext);
