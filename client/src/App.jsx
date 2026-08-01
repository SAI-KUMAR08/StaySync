import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./layouts/DashboardLayout";
import { PaymentProvider } from "./context/PaymentContext";

// Eagerly imported pages — all bundled upfront, no lazy-loading delays
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import TenantDashboard from "./pages/TenantDashboard";
import TenantManagement from "./pages/TenantManagement";
import Complaints from "./pages/Complaints";
import Payments from "./pages/Payments";
import Notifications from "./pages/Notifications";
import RoomManagement from "./pages/RoomManagement";
import Expenses from "./pages/Expenses";
import MealTimings from "./pages/MealTimings";
import TenantProfile from "./pages/TenantProfile";
import AdminLogin from "./pages/AdminLogin";
import AdminRequests from "./pages/AdminRequests";
import TenantProfileSettings from "./pages/TenantProfileSettings";
import TenantRoomShift from "./pages/TenantRoomShift";
import AdminProfile from "./pages/AdminProfile";

const ThemeAwareToaster = () => {
  return (
    <Toaster
      position="top-right"
      gutter={10}
      containerClassName="toast-container"
      toastOptions={{
        className: "toast-custom",
        duration: 3500,
        style: {
          background: "rgba(26, 24, 23, 0.88)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderLeft: "3px solid #6B8F71",
          borderRadius: "16px",
          color: "#F5F0EB",
          padding: "16px 20px",
          fontSize: "0.875rem",
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
          boxShadow: "0 12px 40px -8px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(107, 143, 113, 0.08)",
        },
        success: {
          duration: 3000,
          iconTheme: {
            primary: "#6B8F71",
            secondary: "#2C2B28",
          },
        },
        error: {
          duration: 4000,
          iconTheme: {
            primary: "#C62828",
            secondary: "#2C2B28",
          },
        },
      }}
    />
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <ErrorBoundary>
            <ThemeAwareToaster />
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/admin-login" element={<AdminLogin />} />

              {/* Owner Routes */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute role={["owner"]}>
                    <PaymentProvider>
                      <DashboardLayout />
                    </PaymentProvider>
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="inventory" element={<RoomManagement />} />
                <Route path="tenants" element={<TenantManagement />} />
                <Route path="complaints" element={<Complaints />} />
                <Route path="payments" element={<Payments />} />
                <Route path="expenses" element={<Expenses />} />
                <Route path="meal-timings" element={<MealTimings />} />
                <Route path="tenants/:id" element={<TenantProfile />} />
                <Route path="requests" element={<AdminRequests />} />
                {/* Legacy deep links — redirect to the unified Requests page */}
                <Route
                  path="vacate-requests"
                  element={<Navigate to="/admin/requests?type=vacate" replace />}
                />
                <Route
                  path="bed-shift-requests"
                  element={<Navigate to="/admin/requests?type=shift" replace />}
                />
                <Route
                  path="profile-requests"
                  element={<Navigate to="/admin/requests?type=profile" replace />}
                />
                <Route path="notifications" element={<Notifications />} />
                <Route path="profile" element={<AdminProfile />} />
              </Route>

              {/* Tenant Routes */}
              <Route
                path="/tenant"
                element={
                  <ProtectedRoute role="tenant">
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<TenantDashboard />} />
                <Route path="complaints" element={<Complaints />} />
                <Route path="payments" element={<Payments />} />
                <Route path="meal-timings" element={<MealTimings />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="profile" element={<TenantProfileSettings />} />
                <Route path="room-shift" element={<TenantRoomShift />} />
              </Route>

              {/* Fallback */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </ErrorBoundary>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
