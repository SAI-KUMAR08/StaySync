import axios from "axios";
import { getAxiosBaseURL } from "../config/api.js";

// ── GET response cache (TTL-based, per-URL) ──────────────────
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds — balances freshness with avoiding redundant requests

function getCached(url) {
  const entry = cache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(url);
    return null;
  }
  return entry.data;
}

function setCached(url, data) {
  cache.set(url, { data, ts: Date.now() });
  if (cache.size > 50) {
    const oldest = cache.entries().next().value;
    if (oldest) cache.delete(oldest[0]);
  }
}

function invalidateCache(prefix) {
  if (!prefix) { cache.clear(); return; }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

const api = axios.create({
  baseURL: getAxiosBaseURL(),
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Cache GET responses — return cached data if fresh
  if (config.method?.toLowerCase() === "get" && !config._skipCache) {
    const cached = getCached(config.url);
    if (cached) {
      config._cached = cached;
      config.adapter = () => Promise.resolve({
        data: cached,
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });
    }
  }

  // Invalidate cache on mutations
  if (config.method && !["get", "head"].includes(config.method.toLowerCase())) {
    const basePath = config.url?.split("?")[0] || "";
    // Invalidate parent resource paths
    invalidateCache(basePath.replace(/\/[^/]+$/, ""));
  }

  return config;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => {
    // Cache successful GET responses
    if (res.config?.method?.toLowerCase() === "get" && res.data) {
      setCached(res.config.url, res.data);
    }
    return res;
  },
  (error) => {
    const originalRequest = error.config;

    if (!error.response && error.message === "Network Error") {
      console.error(
        "[Hostel Manager] API unreachable. Check VITE_API_URL / VITE_DEV_PROXY_TARGET and that the backend is running."
      );
    }

    const isAuthRoute = originalRequest?.url && (
      originalRequest.url.includes("/auth/login") ||
      originalRequest.url.includes("/auth/register") ||
      originalRequest.url.includes("/auth/refresh") ||
      originalRequest.url.includes("/auth/verify-otp") ||
      originalRequest.url.includes("/auth/send-otp")
    );

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthRoute) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      return new Promise((resolve, reject) => {
        api
          .post("/auth/refresh")
          .then(({ data }) => {
            const newAccessToken = data?.data?.accessToken;
            if (newAccessToken) {
              sessionStorage.setItem("token", newAccessToken);
              api.defaults.headers.common["Authorization"] = `Bearer ${newAccessToken}`;
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
              processQueue(null, newAccessToken);
              resolve(api(originalRequest));
            } else {
              const refreshErr = new Error("No token in refresh response");
              processQueue(refreshErr, null);
              reject(refreshErr);
              sessionStorage.removeItem("token");
              if (window.location.pathname !== "/login" && window.location.pathname !== "/onboarding") {
                window.location.href = "/login";
              }
            }
          })
          .catch((err) => {
            processQueue(err, null);
            reject(err);
            sessionStorage.removeItem("token");
            if (window.location.pathname !== "/login" && window.location.pathname !== "/onboarding") {
              window.location.href = "/login";
            }
          })
          .finally(() => {
            isRefreshing = false;
          });
      });
    }

    if (error.response?.status === 401) {
      sessionStorage.removeItem("token");
      if (window.location.pathname !== "/login" && window.location.pathname !== "/onboarding") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
