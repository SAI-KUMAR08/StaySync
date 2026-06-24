import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import ProtectedRoute from "./components/ProtectedRoute";
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
          <Toaster position="top-right" />
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
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
