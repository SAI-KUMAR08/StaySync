import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import api, { invalidateCache } from "../api/axios";
import toast from "react-hot-toast";
import { getApiError } from "../utils/getApiError";

const defaultAuth = {
  user: null,
  loading: true,
  hostels: [],
  login: async () => {
    throw new Error("AuthProvider is missing");
  },
  sendOwnerLoginOtp: async () => {
    throw new Error("AuthProvider is missing");
  },
  verifyOwnerLoginOtp: async () => {
    throw new Error("AuthProvider is missing");
  },
  registerOwner: async () => {
    throw new Error("AuthProvider is missing");
  },
  sendOTP: async () => {
    throw new Error("AuthProvider is missing");
  },
  tenantLogin: async () => {
    throw new Error("AuthProvider is missing");
  },
  checkTenantStatus: async () => ({ exists: false, hasPassword: false }),
  tenantPasswordLogin: async () => {
    throw new Error("AuthProvider is missing");
  },
  setTenantPassword: async () => {
    throw new Error("AuthProvider is missing");
  },
  setInitialPassword: async () => {
    throw new Error("AuthProvider is missing");
  },
  sendForgotOtp: async () => {
    throw new Error("AuthProvider is missing");
  },
  resetTenantPassword: async () => {
    throw new Error("AuthProvider is missing");
  },
  switchHostel: async () => {
    throw new Error("AuthProvider is missing");
  },
  logout: () => {},
};

const AuthContext = createContext(defaultAuth);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hostels, setHostels] = useState([]);
  const [loadingStates, setLoadingStates] = useState({
    login: false,
    sendOtp: false,
    verifyOtp: false,
    sendOwnerOtp: false,
    verifyOwnerOtp: false,
    register: false,
    logout: false,
    checkStatus: false,
    sendForgotOtp: false,
    resetPassword: false,
    setPassword: false,
    setInitialPassword: false,
    tenantPasswordLogin: false,
  });

  const fetchUser = useCallback(async () => {
    // Retry transient (non-401) failures up to 3 times with backoff so a
    // flaky network/server doesn't log out a valid session (H16).
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await api.get("/auth/me");
        setUser(res.data.data);
        if (res.data.data?.role === "owner") {
          const hostelsRes = await api.get("/owner/hostels");
          setHostels(hostelsRes.data.data || []);
        } else {
          setHostels([]);
        }
        setLoading(false);
        return;
      } catch (err) {
        // Real auth failure — clear the session (unchanged behavior)
        if (err.response?.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("refreshToken");
          setUser(null);
          setHostels([]);
          setLoading(false);
          return;
        }
        // Network/server error — keep the session, back off and retry
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1000 : 2000));
        }
      }
    }
    // All retries exhausted — keep the token so the user can refresh/retry;
    // just stop the loading spinner.
    console.warn("fetchUser: non-auth error after 3 attempts, retaining session");
    setLoading(false);
  }, []);

  const login = useCallback(async (email, password) => {
    setLoadingStates((prev) => ({ ...prev, login: true }));
    try {
      const res = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", res.data.data.accessToken);
      localStorage.setItem("refreshToken", res.data.data.refreshToken);
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
    } finally {
      setLoadingStates((prev) => ({ ...prev, login: false }));
    }
  }, []);

  const sendOwnerLoginOtp = useCallback(async (email) => {
    setLoadingStates((prev) => ({ ...prev, sendOwnerOtp: true }));
    try {
      const res = await api.post("/auth/owner/login/send-otp", { email });
      toast.success("OTP sent to your email!");
      return res.data.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send OTP");
      throw error;
    } finally {
      setLoadingStates((prev) => ({ ...prev, sendOwnerOtp: false }));
    }
  }, []);

  const verifyOwnerLoginOtp = useCallback(async (email, otp) => {
    setLoadingStates((prev) => ({ ...prev, verifyOwnerOtp: true }));
    try {
      const res = await api.post("/auth/owner/login/verify-otp", { email, otp });
      localStorage.setItem("token", res.data.data.accessToken);
      localStorage.setItem("refreshToken", res.data.data.refreshToken);
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
    } finally {
      setLoadingStates((prev) => ({ ...prev, verifyOwnerOtp: false }));
    }
  }, []);

  const registerOwner = useCallback(async (formData) => {
    setLoadingStates((prev) => ({ ...prev, register: true }));
    try {
      const res = await api.post("/auth/register", formData);
      localStorage.setItem("token", res.data.data.accessToken);
      localStorage.setItem("refreshToken", res.data.data.refreshToken);
      setUser(res.data.data.user);
      const hostelsRes = await api.get("/owner/hostels");
      setHostels(hostelsRes.data.data || []);
      toast.success("Registration successful!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Registration failed");
      throw error;
    } finally {
      setLoadingStates((prev) => ({ ...prev, register: false }));
    }
  }, []);

  const sendOTP = useCallback(async (phone) => {
    setLoadingStates((prev) => ({ ...prev, sendOtp: true }));
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
    } finally {
      setLoadingStates((prev) => ({ ...prev, sendOtp: false }));
    }
  }, []);

  const tenantLogin = useCallback(async (phone, otp) => {
    setLoadingStates((prev) => ({ ...prev, verifyOtp: true }));
    try {
      const res = await api.post("/auth/tenant/verify-otp", { phone, otp });
      localStorage.setItem("token", res.data.data.accessToken);
      localStorage.setItem("refreshToken", res.data.data.refreshToken);
      setUser(res.data.data.user);
      setHostels([]);
      toast.success("Login successful!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Invalid OTP");
      throw error;
    } finally {
      setLoadingStates((prev) => ({ ...prev, verifyOtp: false }));
    }
  }, []);

  const switchHostel = useCallback(async (hostelId) => {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("No active session");
    try {
      const res = await api.post("/auth/switch-hostel", { hostelId });
      localStorage.setItem("token", res.data.data.accessToken);
      localStorage.setItem("refreshToken", res.data.data.refreshToken);
      invalidateCache(); // Clear stale cached data from previous hostel
      setUser(res.data.data.user);
      const hostelsRes = await api.get("/owner/hostels");
      setHostels(hostelsRes.data.data || []);
      toast.success(`Switched to ${res.data.data.user.hostelName}`);
      return res.data.data.user;
    } catch (error) {
      toast.error(getApiError(error));
      throw error;
    }
  }, []);

  const refreshHostels = useCallback(async () => {
    try {
      const hostelsRes = await api.get("/owner/hostels");
      const list = hostelsRes.data.data || [];
      setHostels(list);
      return list;
    } catch (error) {
      console.error("Failed to refresh hostels:", error);
    }
  }, []);

  const checkTenantStatus = useCallback(async (phone) => {
    setLoadingStates((prev) => ({ ...prev, checkStatus: true }));
    try {
      const res = await api.post("/auth/tenant/check-status", { phone });
      return res.data.data;
    } finally {
      setLoadingStates((prev) => ({ ...prev, checkStatus: false }));
    }
  }, []);

  const tenantPasswordLogin = useCallback(async (phone, password) => {
    setLoadingStates((prev) => ({ ...prev, tenantPasswordLogin: true }));
    try {
      const res = await api.post("/auth/tenant/login", { phone, password });
      localStorage.setItem("token", res.data.data.accessToken);
      localStorage.setItem("refreshToken", res.data.data.refreshToken);
      setUser(res.data.data.user);
      setHostels([]);
      toast.success("Welcome back!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Login failed");
      throw error;
    } finally {
      setLoadingStates((prev) => ({ ...prev, tenantPasswordLogin: false }));
    }
  }, []);

  const setTenantPassword = useCallback(async (phone, otp, password) => {
    setLoadingStates((prev) => ({ ...prev, setPassword: true }));
    try {
      const res = await api.post("/auth/tenant/set-password", { phone, otp, password });
      localStorage.setItem("token", res.data.data.accessToken);
      localStorage.setItem("refreshToken", res.data.data.refreshToken);
      setUser(res.data.data.user);
      setHostels([]);
      toast.success("Password set successfully!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to set password");
      throw error;
    } finally {
      setLoadingStates((prev) => ({ ...prev, setPassword: false }));
    }
  }, []);

  const setInitialPassword = useCallback(async (phone, password) => {
    setLoadingStates((prev) => ({ ...prev, setInitialPassword: true }));
    try {
      // First-time password creation: mobile verified first, then password set
      // directly (no OTP). doesPassCreated flips to true server-side.
      const res = await api.post("/auth/tenant/set-initial-password", { phone, password });
      localStorage.setItem("token", res.data.data.accessToken);
      localStorage.setItem("refreshToken", res.data.data.refreshToken);
      setUser(res.data.data.user);
      setHostels([]);
      toast.success("Password set successfully!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to set password");
      throw error;
    } finally {
      setLoadingStates((prev) => ({ ...prev, setInitialPassword: false }));
    }
  }, []);

  const sendForgotOtp = useCallback(async (phone) => {
    setLoadingStates((prev) => ({ ...prev, sendForgotOtp: true }));
    try {
      const res = await api.post("/auth/tenant/forgot-password", { phone });
      toast.success("OTP sent to your registered email!");
      return res.data.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send OTP");
      throw error;
    } finally {
      setLoadingStates((prev) => ({ ...prev, sendForgotOtp: false }));
    }
  }, []);

  const resetTenantPassword = useCallback(async (phone, otp, newPassword) => {
    setLoadingStates((prev) => ({ ...prev, resetPassword: true }));
    try {
      const res = await api.post("/auth/tenant/reset-password", { phone, otp, newPassword });
      localStorage.setItem("token", res.data.data.accessToken);
      localStorage.setItem("refreshToken", res.data.data.refreshToken);
      setUser(res.data.data.user);
      setHostels([]);
      toast.success("Password reset successfully!");
      return res.data.data.user;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to reset password");
      throw error;
    } finally {
      setLoadingStates((prev) => ({ ...prev, resetPassword: false }));
    }
  }, []);

  const logout = useCallback(async () => {
    invalidateCache(); // Defense-in-depth: drop cached data before clearing the session (C-1)
    setLoadingStates((prev) => ({ ...prev, logout: true }));
    try {
      await api.post("/auth/logout");
    } catch (error) {
      console.error("Failed to invalidate session on backend:", error);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      setUser(null);
      setHostels([]);
      toast.success("Logged out");
      setLoadingStates((prev) => ({ ...prev, logout: false }));
    }
  }, []);

  // Restore the session on mount
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [fetchUser]);

  // Cross-tab logout/login sync — `storage` events fire only in OTHER tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== "token") return;
      if (!e.newValue) {
        // Token removed in another tab → sign out locally
        setUser(null);
        setHostels([]);
        invalidateCache();
      } else {
        // New/changed token in another tab → re-sync the profile
        fetchUser();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [fetchUser]);

  const contextValue = useMemo(
    () => ({
      user,
      hostels,
      loading,
      loadingStates,
      login,
      sendOwnerLoginOtp,
      verifyOwnerLoginOtp,
      sendOTP,
      tenantLogin,
      checkTenantStatus,
      tenantPasswordLogin,
      setTenantPassword,
      setInitialPassword,
      sendForgotOtp,
      resetTenantPassword,
      registerOwner,
      switchHostel,
      refreshHostels,
      logout,
    }),
    [
      user,
      hostels,
      loading,
      loadingStates,
      login,
      sendOwnerLoginOtp,
      verifyOwnerLoginOtp,
      sendOTP,
      tenantLogin,
      checkTenantStatus,
      tenantPasswordLogin,
      setTenantPassword,
      setInitialPassword,
      sendForgotOtp,
      resetTenantPassword,
      registerOwner,
      switchHostel,
      refreshHostels,
      logout,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext) ?? defaultAuth;
