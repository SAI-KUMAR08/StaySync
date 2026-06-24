import axios from "axios";
import { getAxiosBaseURL } from "../config/api.js";

const api = axios.create({
  baseURL: getAxiosBaseURL(),
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
  (res) => res,
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
