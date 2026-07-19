import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { ThemeProvider } from "./context/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./layouts/DashboardLayout";

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

// Lazy-loaded pages — split into separate chunks, loaded on demand
const Login = lazy(() => import("./pages/Login"));
const OwnerOnboarding = lazy(() => import("./pages/OwnerOnboarding"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const TenantDashboard = lazy(() => import("./pages/TenantDashboard"));
const TenantManagement = lazy(() => import("./pages/TenantManagement"));
const Complaints = lazy(() => import("./pages/Complaints"));
const Payments = lazy(() => import("./pages/Payments"));
const Notifications = lazy(() => import("./pages/Notifications"));
const RoomManagement = lazy(() => import("./pages/RoomManagement"));
const Expenses = lazy(() => import("./pages/Expenses"));
const MealTimings = lazy(() => import("./pages/MealTimings"));
const ResidentProfile = lazy(() => import("./pages/ResidentProfile"));

// Minimal page-level skeleton — shown instantly while chunk loads
const PageSkeleton = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <ErrorBoundary>
            <ThemeProvider>
              <ThemeAwareToaster />
              <Suspense fallback={<PageSkeleton />}>
                <Routes>
                  {/* Public Routes */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/onboarding" element={<OwnerOnboarding />} />

                  {/* Owner/Manager Routes */}
                  <Route path="/admin" element={
                    <ProtectedRoute role={["owner", "manager"]}>
                      <DashboardLayout />
                    </ProtectedRoute>
                  }>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<AdminDashboard />} />
                    <Route path="inventory" element={<RoomManagement />} />
                    <Route path="tenants" element={<TenantManagement />} />
                    <Route path="complaints" element={<Complaints />} />
                    <Route path="payments" element={<Payments />} />
                    <Route path="expenses" element={<Expenses />} />
                    <Route path="meal-timings" element={<MealTimings />} />
                    <Route path="tenants/:id" element={<ResidentProfile />} />
                    <Route path="notifications" element={<Notifications />} />
                  </Route>

                  {/* Tenant Routes */}
                  <Route path="/tenant" element={
                    <ProtectedRoute role="tenant">
                      <DashboardLayout />
                    </ProtectedRoute>
                  }>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<TenantDashboard />} />
                    <Route path="complaints" element={<Complaints />} />
                    <Route path="payments" element={<Payments />} />
                    <Route path="meal-timings" element={<MealTimings />} />
                    <Route path="notifications" element={<Notifications />} />
                  </Route>

                  {/* Fallback */}
                  <Route path="/" element={<Navigate to="/login" replace />} />
                  <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
              </Suspense>
            </ThemeProvider>
          </ErrorBoundary>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
