import { lazy, Suspense } from "react";
import { Navigate, Routes, Route } from "react-router-dom";

import AppShell from "@/layouts/AppShell";
import PrivateRoute from "@/components/routing/PrivateRoute";
import GuestAuthRoute from "@/components/routing/GuestAuthRoute";
import PageLoader from "@/components/common/PageLoader";

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
const AdminTrainingDataResetPage = lazy(() => import("@/pages/admin/AdminTrainingDataResetPage"));

// Common pages
const UnauthorizedPage = lazy(() => import("@/pages/common/UnauthorizedPage"));
const NotFoundPage = lazy(() => import("@/pages/common/NotFoundPage"));

function SuspenseWrapper({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Public */}
        <Route path="/" element={<SuspenseWrapper><LandingPage /></SuspenseWrapper>} />
        <Route path="/rooms" element={<SuspenseWrapper><RoomsPage /></SuspenseWrapper>} />
        <Route path="/rooms/:roomId" element={<SuspenseWrapper><RoomDetailPage /></SuspenseWrapper>} />

        <Route
          path="/login"
          element={
            <GuestAuthRoute>
              <SuspenseWrapper><LoginPage /></SuspenseWrapper>
            </GuestAuthRoute>
          }
        />
        <Route
          path="/register"
          element={
            <GuestAuthRoute>
              <SuspenseWrapper><RegisterPage /></SuspenseWrapper>
            </GuestAuthRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestAuthRoute>
              <SuspenseWrapper><ForgotPasswordPage /></SuspenseWrapper>
            </GuestAuthRoute>
          }
        />
        <Route path="/about" element={<SuspenseWrapper><AboutPage /></SuspenseWrapper>} />
        <Route path="/contact" element={<SuspenseWrapper><ContactPage /></SuspenseWrapper>} />
        <Route path="/privacy" element={<SuspenseWrapper><PrivacyPage /></SuspenseWrapper>} />
        <Route path="/unauthorized" element={<SuspenseWrapper><UnauthorizedPage /></SuspenseWrapper>} />

        {/* Guest (Role: guest) */}
        <Route path="/booking" element={<Navigate to="/rooms" replace />} />
        <Route
          path="/booking/:roomId"
          element={
            <PrivateRoute allowedRoles={["guest"]}>
              <SuspenseWrapper><BookingPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/my-bookings"
          element={
            <PrivateRoute allowedRoles={["guest"]}>
              <SuspenseWrapper><MyBookingsPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <PrivateRoute allowedRoles={["guest"]}>
              <SuspenseWrapper><ProfilePage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/favorites"
          element={
            <PrivateRoute allowedRoles={["guest"]}>
              <SuspenseWrapper><FavoritesPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />

        {/* Shared Authenticated */}
        <Route
          path="/notifications"
          element={
            <PrivateRoute allowedRoles={["guest", "fo", "admin"]}>
              <SuspenseWrapper><NotificationsPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />

        {/* Front Office (Role: fo) */}
        <Route
          path="/fo"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <SuspenseWrapper><FoDashboardPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/check-in"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <SuspenseWrapper><FoCheckInPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/check-out"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <SuspenseWrapper><FoCheckOutPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/housekeeping"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <SuspenseWrapper><FoHousekeepingPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/payments"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <SuspenseWrapper><FoPaymentsPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/announcements"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <SuspenseWrapper><FoAnnouncementsPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/room-rates"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <SuspenseWrapper><FoRoomRatesPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/messages"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <SuspenseWrapper><MessagesPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/bookings"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <SuspenseWrapper><FoBookingsPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/testimonials"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <SuspenseWrapper><FoTestimonialsPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/cancellations"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <SuspenseWrapper><FoCancellationsPage /></SuspenseWrapper>
            </PrivateRoute>
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
          path="/admin/training-reset"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <SuspenseWrapper><AdminTrainingDataResetPage /></SuspenseWrapper>
            </PrivateRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<SuspenseWrapper><NotFoundPage /></SuspenseWrapper>} />
      </Route>
    </Routes>
  );
}
