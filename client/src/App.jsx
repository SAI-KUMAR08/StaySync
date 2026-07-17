import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./layouts/DashboardLayout";

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
          <Toaster
            position="top-right"
            gutter={10}
            containerClassName="toast-container"
            toastOptions={{
              className: "toast-custom",
              duration: 3500,
              style: {
                background: "rgba(26, 26, 40, 0.75)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderLeft: "3px solid #FBBF24",
                borderRadius: "12px",
                color: "#F5F5FA",
                padding: "14px 18px",
                fontSize: "0.875rem",
                fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                boxShadow:
                  "0 8px 32px -8px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(251, 191, 36, 0.06)",
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: "#FBBF24",
                  secondary: "#1A1A28",
                },
              },
              error: {
                duration: 4000,
                iconTheme: {
                  primary: "#FB7185",
                  secondary: "#1A1A28",
                },
              },
            }}
          />
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
              <Route path="notifications" element={<Notifications />} />
            </Route>

            {/* Fallback */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
