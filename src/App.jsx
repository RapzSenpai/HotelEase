import { Navigate, Routes, Route } from "react-router-dom";

import AppShell from "@/layouts/AppShell";
import PrivateRoute from "@/components/routing/PrivateRoute";
import GuestAuthRoute from "@/components/routing/GuestAuthRoute";

import LandingPage from "@/pages/public/LandingPage";
import RoomsPage from "@/pages/public/RoomsPage";
import RoomDetailPage from "@/pages/public/RoomDetailPage";
import LoginPage from "@/pages/public/LoginPage";
import RegisterPage from "@/pages/public/RegisterPage";
import ForgotPasswordPage from "@/pages/public/ForgotPasswordPage";
import BookingPage from "@/pages/public/BookingPage";
import MyBookingsPage from "@/pages/public/MyBookingsPage";
import ProfilePage from "@/pages/public/ProfilePage";
import FavoritesPage from "@/pages/public/FavoritesPage";
import AboutPage from "@/pages/public/AboutPage";
import ContactPage from "@/pages/public/ContactPage";
import PrivacyPage from "@/pages/public/PrivacyPage";
import NotificationsPage from "@/pages/shared/NotificationsPage";

import FoDashboardPage from "@/pages/fo/FoDashboardPage";
import FoCheckInPage from "@/pages/fo/FoCheckInPage";
import FoCheckOutPage from "@/pages/fo/FoCheckOutPage";
import FoHousekeepingPage from "@/pages/fo/FoHousekeepingPage";
import FoPaymentsPage from "@/pages/fo/FoPaymentsPage";
import FoAnnouncementsPage from "@/pages/fo/FoAnnouncementsPage";
import FoRoomRatesPage from "@/pages/fo/FoRoomRatesPage";
import FoBookingsPage from "@/pages/fo/FoBookingsPage";
import MessagesPage from "@/pages/fo/MessagesPage";
import FoTestimonialsPage from "@/pages/fo/FoTestimonialsPage";
import FoCancellationsPage from "@/pages/fo/FoCancellationsPage";

import AdminAnalyticsPage from "@/pages/admin/AdminAnalyticsPage";
import AdminUserManagementPage from "@/pages/admin/AdminUserManagementPage";
import AdminRoomManagementPage from "@/pages/admin/AdminRoomManagementPage";
import AdminSystemSettingsPage from "@/pages/admin/AdminSystemSettingsPage";
import AdminTrainingDataResetPage from "@/pages/admin/AdminTrainingDataResetPage";

import UnauthorizedPage from "@/pages/common/UnauthorizedPage";
import NotFoundPage from "@/pages/common/NotFoundPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/rooms/:roomId" element={<RoomDetailPage />} />

        <Route
          path="/login"
          element={
            <GuestAuthRoute>
              <LoginPage />
            </GuestAuthRoute>
          }
        />
        <Route
          path="/register"
          element={
            <GuestAuthRoute>
              <RegisterPage />
            </GuestAuthRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestAuthRoute>
              <ForgotPasswordPage />
            </GuestAuthRoute>
          }
        />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Guest (Role: guest) */}
        <Route path="/booking" element={<Navigate to="/rooms" replace />} />
        <Route
          path="/booking/:roomId"
          element={
            <PrivateRoute allowedRoles={["guest"]}>
              <BookingPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/my-bookings"
          element={
            <PrivateRoute allowedRoles={["guest"]}>
              <MyBookingsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <PrivateRoute allowedRoles={["guest"]}>
              <ProfilePage />
            </PrivateRoute>
          }
        />
        <Route
          path="/favorites"
          element={
            <PrivateRoute allowedRoles={["guest"]}>
              <FavoritesPage />
            </PrivateRoute>
          }
        />
        
        {/* Shared Authenticated */}
        <Route
          path="/notifications"
          element={
            <PrivateRoute allowedRoles={["guest", "fo", "admin"]}>
              <NotificationsPage />
            </PrivateRoute>
          }
        />

        {/* Front Office (Role: fo) */}
        <Route
          path="/fo"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <FoDashboardPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/check-in"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <FoCheckInPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/check-out"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <FoCheckOutPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/housekeeping"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <FoHousekeepingPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/payments"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <FoPaymentsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/announcements"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <FoAnnouncementsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/room-rates"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <FoRoomRatesPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/messages"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <MessagesPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/bookings"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <FoBookingsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/testimonials"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <FoTestimonialsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/fo/cancellations"
          element={
            <PrivateRoute allowedRoles={["fo"]}>
              <FoCancellationsPage />
            </PrivateRoute>
          }
        />

        {/* Admin (Role: admin) */}
        <Route
          path="/admin"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <AdminAnalyticsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <AdminUserManagementPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/rooms"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <AdminRoomManagementPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <AdminSystemSettingsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/training-reset"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <AdminTrainingDataResetPage />
            </PrivateRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
