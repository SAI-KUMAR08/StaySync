import axios from "axios";
import { getAxiosBaseURL } from "../config/api.js";

// ── GET response cache (stale-while-revalidate, per-URL) ─────
const cache = new Map();
const CACHE_TTL = 30000; // 30s — data is "fresh"
const STALE_TTL = 300000; // 5min — stale data served instantly while re-fetching in background

function getCached(url) {
  const entry = cache.get(url);
  if (!entry) return null;
  const age = Date.now() - entry.ts;
  // Fresh: return immediately
  if (age < CACHE_TTL) return { data: entry.data, stale: false };
  // Stale but within STALE_TTL: return immediately, trigger background refresh
  if (age < STALE_TTL) return { data: entry.data, stale: true };
  // Expired: remove and return null
  cache.delete(url);
  return null;
}

function setCached(url, data) {
  cache.set(url, { data, ts: Date.now() });
  if (cache.size > 100) {
    // Evict oldest entry
    const oldest = cache.entries().next().value;
    if (oldest) cache.delete(oldest[0]);
  }
}

function invalidateCache(prefix) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

// Bumped on every mutation. A GET response is only written back to the cache if
// no mutation happened while it was in flight — otherwise a stale background
// refresh could restore data that a mutation just invalidated (C-7).
let cacheEpoch = 0;

// Last Authorization token seen by the request interceptor. When it changes
// (login, logout, hostel switch) the GET cache is dropped so data from a
// previous account/context can never leak into the new session (C-1).
let lastSeenToken = null;

const api = axios.create({
  baseURL: getAxiosBaseURL(),
  withCredentials: true,
  timeout: 15000,
});

// Track background re-fetches per URL to avoid duplicates
const pendingRefreshes = new Map();

// Auth endpoints where a 401 means "bad credentials / bad OTP" rather than an
// expired access token. These must not trigger the silent token-refresh flow.
const AUTH_CREDENTIAL_ROUTES = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/register-owner",
  "/auth/owner/send-otp",
  "/auth/owner/verify-otp",
  "/auth/owner/login/send-otp",
  "/auth/owner/login/verify-otp",
  "/auth/send-otp",
  "/auth/verify-otp",
  "/auth/tenant/send-otp",
  "/auth/tenant/verify-otp",
  "/auth/tenant/check-status",
  "/auth/tenant/login",
  "/auth/tenant/set-password",
  "/auth/tenant/set-initial-password",
  "/auth/tenant/forgot-password",
  "/auth/tenant/reset-password",
  // A 401 from the refresh endpoint is terminal — never loop on it.
  "/auth/refresh",
]);

function isAuthCredentialRoute(url) {
  if (!url) return false;
  const path = url.split("?")[0].replace(/\/+$/, "");
  return AUTH_CREDENTIAL_ROUTES.has(path);
}

api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem("token");

  // Session changed (login, logout, hostel switch) — drop any cached GETs that
  // could belong to a different account/context (C-1).
  if (token !== lastSeenToken) {
    invalidateCache();
    lastSeenToken = token;
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    // No session — never send a stale default Authorization header.
    delete api.defaults.headers.common["Authorization"];
  }

  // Stale-while-revalidate for GET requests
  if (config.method?.toLowerCase() === "get") {
    // Remember the cache epoch so the response is discarded if a mutation
    // invalidated the cache while this request was in flight.
    config._requestEpoch = cacheEpoch;

    if (!config._skipCache && !config._bgRefresh) {
      const cached = getCached(config.url);
      if (cached) {
        // If stale, trigger a background refresh (once per URL)
        if (cached.stale && !pendingRefreshes.has(config.url)) {
          pendingRefreshes.set(config.url, true);
          api.get(config.url, { _bgRefresh: true, _skipCache: true }).finally(() => {
            pendingRefreshes.delete(config.url);
          });
        }
        // Return cached data instantly (fresh or stale)
        config._cached = cached.data;
        config.adapter = () =>
          Promise.resolve({
            data: cached.data,
            status: 200,
            statusText: "OK",
            headers: {},
            config,
          });
      }
    }
  }

  // Invalidate the cache on ANY mutation. Cross-cutting views (dashboard stats,
  // occupancy, structure, payment totals) aggregate data from many resources, so
  // a mutation on one resource can stale a GET for an unrelated-looking URL. Clear
  // everything instead of guessing a parent path — the next GET for affected data
  // hits the server. This does not add traffic; it only drops cached copies so a
  // re-fetch after a successful change returns fresh data.
  if (config.method && !["get", "head"].includes(config.method.toLowerCase())) {
    invalidateCache();
    cacheEpoch += 1;
  }

  return config;
});

let isRefreshing = false;
let failedQueue = [];
// Bounds how many 401s can wait on a single refresh — prevents unbounded
// queue growth under rapid 401 bursts (H-8).
const MAX_QUEUE_SIZE = 50;

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
    // Cache successful GET responses — but only if no mutation invalidated the
    // cache while the request was in flight (prevents stale restores, C-7).
    if (
      res.config?.method?.toLowerCase() === "get" &&
      res.data &&
      !res.config._cached && // served from cache — don't re-stamp freshness (H14)
      res.config._requestEpoch === cacheEpoch
    ) {
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

    // Endpoints where a 401 is the EXPECTED "bad credentials / bad OTP"
    // response (not an expired access token) — never trigger the silent
    // refresh flow for these. Authenticated endpoints like /auth/me or
    // /auth/switch-hostel are NOT listed, so they still refresh on 401.
    const isAuthRoute = isAuthCredentialRoute(originalRequest?.url);

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthRoute
    ) {
      if (isRefreshing) {
        // Queue is full — fail fast instead of queueing without bound.
        if (failedQueue.length >= MAX_QUEUE_SIZE) {
          return Promise.reject(error);
        }
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
          .post("/auth/refresh", { refreshToken: localStorage.getItem("refreshToken") })
          .then(({ data }) => {
            const newAccessToken = data?.data?.accessToken;
            if (newAccessToken) {
              localStorage.setItem("token", newAccessToken);
              if (data?.data?.refreshToken)
                localStorage.setItem("refreshToken", data.data.refreshToken);
              api.defaults.headers.common["Authorization"] = `Bearer ${newAccessToken}`;
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
              processQueue(null, newAccessToken);
              resolve(api(originalRequest));
            } else {
              const refreshErr = new Error("No token in refresh response");
              processQueue(refreshErr, null);
              reject(refreshErr);
              localStorage.removeItem("token");
              localStorage.removeItem("refreshToken");
              if (
                window.location.pathname !== "/login" &&
                window.location.pathname !== "/admin-login"
              ) {
                window.location.href = "/login";
              }
            }
          })
          .catch((err) => {
            processQueue(err, null);
            reject(err);
            localStorage.removeItem("token");
            localStorage.removeItem("refreshToken");
            if (
              window.location.pathname !== "/login" &&
              window.location.pathname !== "/admin-login"
            ) {
              window.location.href = "/login";
            }
          })
          .finally(() => {
            isRefreshing = false;
          });
      });
    }

    if (error.response?.status === 401 && !isAuthRoute) {
      localStorage.removeItem("token");
      if (window.location.pathname !== "/login" && window.location.pathname !== "/admin-login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export { invalidateCache };
export default api;
