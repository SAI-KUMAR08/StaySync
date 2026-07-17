import React, { createContext, useContext, useState, useEffect } from "react";
import api from "../api/axios";
import toast from "react-hot-toast";
import { getApiError } from "../utils/getApiError";

const defaultAuth = {
  user: null,
  loading: true,
  hostels: [],
  login: async () => { throw new Error("AuthProvider is missing"); },
  sendOwnerLoginOtp: async () => { throw new Error("AuthProvider is missing"); },
  verifyOwnerLoginOtp: async () => { throw new Error("AuthProvider is missing"); },
  registerOwner: async () => { throw new Error("AuthProvider is missing"); },
  sendOTP: async () => { throw new Error("AuthProvider is missing"); },
  tenantLogin: async () => { throw new Error("AuthProvider is missing"); },
  checkTenantStatus: async () => ({ exists: false, hasPassword: false }),
  tenantPasswordLogin: async () => { throw new Error("AuthProvider is missing"); },
  setTenantPassword: async () => { throw new Error("AuthProvider is missing"); },
  setInitialPassword: async () => { throw new Error("AuthProvider is missing"); },
  sendForgotOtp: async () => { throw new Error("AuthProvider is missing"); },
  resetTenantPassword: async () => { throw new Error("AuthProvider is missing"); },
  switchHostel: async () => { throw new Error("AuthProvider is missing"); },
  loginVerifiedOwner: () => {},
  logout: () => {},
};

const AuthContext = createContext(defaultAuth);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hostels, setHostels] = useState([]);

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data.data);
      if (res.data.data?.role === "owner") {
        const hostelsRes = await api.get("/owner/hostels");
        setHostels(hostelsRes.data.data || []);
      } else {
        setHostels([]);
      }
    } catch (err) {
      // Only clear auth on real auth failures (401), not transient network errors
      if (err.response?.status === 401) {
        sessionStorage.removeItem("token");
        setUser(null);
        setHostels([]);
      } else {
        // Network/server error — keep the session, user can retry
        console.warn("fetchUser: non-auth error, retaining session", err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const res = await api.post("/auth/login", { email, password });
      sessionStorage.setItem("token", res.data.data.accessToken);
      setUser(res.data.data.user);
      if (res.data.data.user?.role === "owner") {
        const hostelsRes = await api.get("/owner/hostels");
        setHostels(hostelsRes.data.data || []);
      } else {
        setHostels([]);
      }
      toast.success("Login successful!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Login failed");
      throw error;
    }
  };

  const sendOwnerLoginOtp = async (email) => {
    try {
      const res = await api.post("/auth/owner/login/send-otp", { email });
      toast.success("OTP sent to your email!");
      return res.data.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send OTP");
      throw error;
    }
  };

  const verifyOwnerLoginOtp = async (email, otp) => {
    try {
      const res = await api.post("/auth/owner/login/verify-otp", { email, otp });
      sessionStorage.setItem("token", res.data.data.accessToken);
      setUser(res.data.data.user);
      if (res.data.data.user?.role === "owner") {
        const hostelsRes = await api.get("/owner/hostels");
        setHostels(hostelsRes.data.data || []);
      } else {
        setHostels([]);
      }
      toast.success("Login successful!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Verification failed");
      throw error;
    }
  };

  const registerOwner = async (formData) => {
    try {
      const res = await api.post("/auth/register", formData);
      sessionStorage.setItem("token", res.data.data.accessToken);
      setUser(res.data.data.user);
      const hostelsRes = await api.get("/owner/hostels");
      setHostels(hostelsRes.data.data || []);
      toast.success("Registration successful!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Registration failed");
      throw error;
    }
  };

  const sendOTP = async (phone) => {
    try {
      const res = await api.post("/auth/tenant/send-otp", { phone });
      toast.success("OTP sent successfully!");
      return res.data.data;
    } catch (error) {
      const status = error.response?.status;
      if (status === 404) {
        toast.error("Tenant not found");
      } else {
        toast.error(getApiError(error));
      }
      throw error;
    }
  };

  const tenantLogin = async (phone, otp) => {
    try {
      const res = await api.post("/auth/tenant/verify-otp", { phone, otp });
      sessionStorage.setItem("token", res.data.data.accessToken);
      setUser(res.data.data.user);
      setHostels([]);
      toast.success("Login successful!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Invalid OTP");
      throw error;
    }
  };

  const switchHostel = async (hostelId) => {
    const token = sessionStorage.getItem("token");
    if (!token) throw new Error("No active session");
    try {
      const res = await api.post("/auth/switch-hostel", { hostelId });
      sessionStorage.setItem("token", res.data.data.accessToken);
      setUser(res.data.data.user);
      const hostelsRes = await api.get("/owner/hostels");
      setHostels(hostelsRes.data.data || []);
      toast.success(`Switched to ${res.data.data.user.hostelName}`);
      return res.data.data.user;
    } catch (error) {
      toast.error(getApiError(error));
      throw error;
    }
  };

  const loginVerifiedOwner = async (userData, token) => {
    sessionStorage.setItem("token", token);
    setUser(userData);
    try {
      const hostelsRes = await api.get("/owner/hostels");
      setHostels(hostelsRes.data.data || []);
    } catch (e) {
      console.error("Failed to load hostels for verified owner:", e);
    }
  };

  const checkTenantStatus = async (phone) => {
    try {
      const res = await api.post("/auth/tenant/check-status", { phone });
      return res.data.data;
    } catch (error) {
      throw error;
    }
  };

  const tenantPasswordLogin = async (phone, password) => {
    try {
      const res = await api.post("/auth/tenant/login", { phone, password });
      sessionStorage.setItem("token", res.data.data.accessToken);
      setUser(res.data.data.user);
      setHostels([]);
      toast.success("Welcome back!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Login failed");
      throw error;
    }
  };

  const setTenantPassword = async (phone, otp, password) => {
    try {
      const res = await api.post("/auth/tenant/set-password", { phone, otp, password });
      sessionStorage.setItem("token", res.data.data.accessToken);
      setUser(res.data.data.user);
      setHostels([]);
      toast.success("Password set successfully!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to set password");
      throw error;
    }
  };

  const setInitialPassword = async (phone, password) => {
    try {
      const res = await api.post("/auth/tenant/set-initial-password", { phone, password });
      sessionStorage.setItem("token", res.data.data.accessToken);
      setUser(res.data.data.user);
      setHostels([]);
      toast.success("Password set successfully!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to set password");
      throw error;
    }
  };

  const sendForgotOtp = async (phone) => {
    try {
      const res = await api.post("/auth/tenant/forgot-password", { phone });
      toast.success("OTP sent to your registered email!");
      return res.data.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send OTP");
      throw error;
    }
  };

  const resetTenantPassword = async (phone, otp, newPassword) => {
    try {
      const res = await api.post("/auth/tenant/reset-password", { phone, otp, newPassword });
      sessionStorage.setItem("token", res.data.data.accessToken);
      setUser(res.data.data.user);
      setHostels([]);
      toast.success("Password reset successfully!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to reset password");
      throw error;
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      console.error("Failed to invalidate session on backend:", error);
    } finally {
      sessionStorage.removeItem("token");
      setUser(null);
      setHostels([]);
      toast.success("Logged out");
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, hostels, loading, login, sendOwnerLoginOtp, verifyOwnerLoginOtp, sendOTP, tenantLogin, checkTenantStatus, tenantPasswordLogin, setTenantPassword, setInitialPassword, sendForgotOtp, resetTenantPassword, registerOwner, loginVerifiedOwner, switchHostel, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext) ?? defaultAuth;
