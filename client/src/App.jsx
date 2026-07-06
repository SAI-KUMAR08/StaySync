import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./layouts/DashboardLayout";

// Pages
import Login from "./pages/Login";
import OwnerOnboarding from "./pages/OwnerOnboarding";
import AdminDashboard from "./pages/AdminDashboard";
import TenantDashboard from "./pages/TenantDashboard";
import TenantManagement from "./pages/TenantManagement";
import Complaints from "./pages/Complaints";
import Payments from "./pages/Payments";
import Notifications from "./pages/Notifications";
import RoomManagement from "./pages/RoomManagement";
import Expenses from "./pages/Expenses";

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
          </ErrorBoundary>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
