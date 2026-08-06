import { lazy, Suspense, useEffect } from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";

import AppShell from "@/layouts/AppShell";
import PrivateRoute from "@/components/routing/PrivateRoute";
import GuestAuthRoute from "@/components/routing/GuestAuthRoute";
import MaintenanceRoute from "@/components/routing/MaintenanceRoute";
import PageLoader from "@/components/common/PageLoader";
import { trackPageView } from "@/services/gaService";

// Public pages
const LandingPage = lazy(() => import("@/pages/public/LandingPage"));
const RoomsPage = lazy(() => import("@/pages/public/RoomsPage"));
const RoomDetailPage = lazy(() => import("@/pages/public/RoomDetailPage"));
const LoginPage = lazy(() => import("@/pages/public/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/public/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/public/ForgotPasswordPage"));
const BookingPage = lazy(() => import("@/pages/public/BookingPage"));
const MyBookingsPage = lazy(() => import("@/pages/public/MyBookingsPage"));
const ProfilePage = lazy(() => import("@/pages/public/ProfilePage"));
const FavoritesPage = lazy(() => import("@/pages/public/FavoritesPage"));
const HousekeepingPage = lazy(() => import("@/pages/public/HousekeepingPage"));
const AboutPage = lazy(() => import("@/pages/public/AboutPage"));
const ContactPage = lazy(() => import("@/pages/public/ContactPage"));
const PrivacyPage = lazy(() => import("@/pages/public/PrivacyPage"));
const NotificationsPage = lazy(() => import("@/pages/shared/NotificationsPage"));

// FO pages
const FoDashboardPage = lazy(() => import("@/pages/fo/FoDashboardPage"));
const FoCheckInPage = lazy(() => import("@/pages/fo/FoCheckInPage"));
const FoCheckOutPage = lazy(() => import("@/pages/fo/FoCheckOutPage"));
const FoHousekeepingPage = lazy(() => import("@/pages/fo/FoHousekeepingPage"));
const FoPaymentsPage = lazy(() => import("@/pages/fo/FoPaymentsPage"));
const FoAnnouncementsPage = lazy(() => import("@/pages/fo/FoAnnouncementsPage"));
const FoRoomRatesPage = lazy(() => import("@/pages/fo/FoRoomRatesPage"));
const FoBookingsPage = lazy(() => import("@/pages/fo/FoBookingsPage"));
const MessagesPage = lazy(() => import("@/pages/fo/MessagesPage"));
const FoTestimonialsPage = lazy(() => import("@/pages/fo/FoTestimonialsPage"));
const FoCancellationsPage = lazy(() => import("@/pages/fo/FoCancellationsPage"));

// Admin pages
const AdminAnalyticsPage = lazy(() => import("@/pages/admin/AdminAnalyticsPage"));
const AdminOperationsPage = lazy(() => import("@/pages/admin/AdminOperationsPage"));
const AdminUserManagementPage = lazy(() => import("@/pages/admin/AdminUserManagementPage"));
const AdminRoomManagementPage = lazy(() => import("@/pages/admin/AdminRoomManagementPage"));
const AdminSystemSettingsPage = lazy(() => import("@/pages/admin/AdminSystemSettingsPage"));
const AdminSystemHealthPage = lazy(() => import("@/pages/admin/AdminSystemHealthPage"));
const AdminPerformancePage = lazy(() => import("@/pages/admin/AdminPerformancePage"));
const AdminAuditLogsPage = lazy(() => import("@/pages/admin/AdminAuditLogsPage"));
const AdminAlertsPage = lazy(() => import("@/pages/admin/AdminAlertsPage"));
const AdminTrainingDataResetPage = lazy(() => import("@/pages/admin/AdminTrainingDataResetPage"));

// Common pages
const UnauthorizedPage = lazy(() => import("@/pages/common/UnauthorizedPage"));
const NotFoundPage = lazy(() => import("@/pages/common/NotFoundPage"));
const MaintenancePage = lazy(() => import("@/pages/common/MaintenancePage"));

function SuspenseWrapper({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

/**
 * Sends a GA4 page_view on every route change.
 */
function GoogleAnalyticsPageTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
}

export default function App() {
  return (
    <>
      <GoogleAnalyticsPageTracker />
      <Routes>
      <Route element={<AppShell />}>
        {/* Maintenance Page */}
        <Route path="/maintenance" element={<SuspenseWrapper><MaintenancePage /></SuspenseWrapper>} />

        {/* Public */}
        <Route path="/" element={<MaintenanceRoute><SuspenseWrapper><LandingPage /></SuspenseWrapper></MaintenanceRoute>} />
        <Route path="/rooms" element={<MaintenanceRoute><SuspenseWrapper><RoomsPage /></SuspenseWrapper></MaintenanceRoute>} />
        <Route path="/rooms/:roomId" element={<MaintenanceRoute><SuspenseWrapper><RoomDetailPage /></SuspenseWrapper></MaintenanceRoute>} />

        <Route
          path="/login"
          element={
            <MaintenanceRoute>
              <GuestAuthRoute>
                <SuspenseWrapper><LoginPage /></SuspenseWrapper>
              </GuestAuthRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/register"
          element={
            <MaintenanceRoute>
              <GuestAuthRoute>
                <SuspenseWrapper><RegisterPage /></SuspenseWrapper>
              </GuestAuthRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <MaintenanceRoute>
              <GuestAuthRoute>
                <SuspenseWrapper><ForgotPasswordPage /></SuspenseWrapper>
              </GuestAuthRoute>
            </MaintenanceRoute>
          }
        />
        <Route path="/about" element={<MaintenanceRoute><SuspenseWrapper><AboutPage /></SuspenseWrapper></MaintenanceRoute>} />
        <Route path="/contact" element={<MaintenanceRoute><SuspenseWrapper><ContactPage /></SuspenseWrapper></MaintenanceRoute>} />
        <Route path="/privacy" element={<MaintenanceRoute><SuspenseWrapper><PrivacyPage /></SuspenseWrapper></MaintenanceRoute>} />
        <Route path="/unauthorized" element={<MaintenanceRoute><SuspenseWrapper><UnauthorizedPage /></SuspenseWrapper></MaintenanceRoute>} />

        {/* Guest (Role: guest) */}
        <Route path="/booking" element={<Navigate to="/rooms" replace />} />
        <Route
          path="/booking/:roomId"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["guest"]}>
                <SuspenseWrapper><BookingPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/my-bookings"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["guest"]}>
                <SuspenseWrapper><MyBookingsPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["guest"]}>
                <SuspenseWrapper><ProfilePage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/favorites"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["guest"]}>
                <SuspenseWrapper><FavoritesPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/housekeeping"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["guest"]}>
                <SuspenseWrapper><HousekeepingPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />

        {/* Shared Authenticated */}
        <Route
          path="/notifications"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["guest", "fo", "admin"]}>
                <SuspenseWrapper><NotificationsPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />

        {/* Front Office (Role: fo) */}
        <Route
          path="/fo"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["fo"]}>
                <SuspenseWrapper><FoDashboardPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/fo/check-in"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["fo"]}>
                <SuspenseWrapper><FoCheckInPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/fo/check-out"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["fo"]}>
                <SuspenseWrapper><FoCheckOutPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/fo/housekeeping"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["fo"]}>
                <SuspenseWrapper><FoHousekeepingPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/fo/payments"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["fo"]}>
                <SuspenseWrapper><FoPaymentsPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/fo/announcements"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["fo"]}>
                <SuspenseWrapper><FoAnnouncementsPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/fo/room-rates"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["fo"]}>
                <SuspenseWrapper><FoRoomRatesPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/fo/bookings"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["fo"]}>
                <SuspenseWrapper><FoBookingsPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />
        <Route
          path="/fo/cancellations"
          element={
            <MaintenanceRoute>
              <PrivateRoute allowedRoles={["fo"]}>
                <SuspenseWrapper><FoCancellationsPage /></SuspenseWrapper>
              </PrivateRoute>
            </MaintenanceRoute>
          }
        />

        {/* Admin (Role: admin) */}
        <Route
          path="/admin"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <SuspenseWrapper><AdminAnalyticsPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/operations"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <SuspenseWrapper><AdminOperationsPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <SuspenseWrapper><AdminUserManagementPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/rooms"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <SuspenseWrapper><AdminRoomManagementPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <SuspenseWrapper><AdminSystemSettingsPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/health"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <SuspenseWrapper><AdminSystemHealthPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/performance"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <SuspenseWrapper><AdminPerformancePage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/audit-logs"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <SuspenseWrapper><AdminAuditLogsPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/alerts"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <SuspenseWrapper><AdminAlertsPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/training-reset"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <SuspenseWrapper><AdminTrainingDataResetPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/messages"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <SuspenseWrapper><MessagesPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/testimonials"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <SuspenseWrapper><FoTestimonialsPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<MaintenanceRoute><SuspenseWrapper><NotFoundPage /></SuspenseWrapper></MaintenanceRoute>} />
      </Route>
    </Routes>
    </>
  );
}
