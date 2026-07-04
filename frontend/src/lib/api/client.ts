import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/store/auth.store";

// ── Fail fast if the env var is missing in production ──────────────────
const API_BASE = (import.meta as any).env?.VITE_API_URL;
if (!API_BASE && (import.meta as any).env?.PROD) {
  throw new Error("VITE_API_URL is not set — cannot start in production without it.");
}

// Single resolved base URL – used by the instance AND the raw refresh call
const BASE_URL = API_BASE || "http://localhost:3001";

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000, // 30s — adjust per your slowest endpoint
});

// ── Request interceptor: attach token ──────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Refresh mutex ──────────────────────────────────────────────────────
// Prevents multiple 401s from firing parallel refresh calls
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refresh = localStorage.getItem("refresh_token");
  const userId = localStorage.getItem("user_id");

  if (!refresh || !userId) {
    throw new Error("Missing refresh credentials");
  }

  // Use a raw axios call — NOT the `api` instance — to avoid
  // interceptor loops if /auth/refresh itself returns 401
  const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
    userId,
    refreshToken: refresh,
  });

  localStorage.setItem("access_token", data.accessToken);
  localStorage.setItem("refresh_token", data.refreshToken);

  return data.accessToken;
}

function forceLogout() {
  // Only remove our keys, not everything on the domain
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user_id");
  useAuthStore.getState().logout();
  window.location.href = "/login";
}

// ── Response interceptor: 401 handling with queued refresh ─────────────
interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as RetryableConfig | undefined;
    if (!original) return Promise.reject(err);

    // Only attempt refresh on 401, and never on the refresh endpoint itself
    const isAuthEndpoint = original.url?.includes("/auth/");
    if (err.response?.status !== 401 || original._retry || isAuthEndpoint) {
      return Promise.reject(err);
    }

    original._retry = true;

    try {
      // If a refresh is already in flight, wait for it instead of firing another
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      const newToken = await refreshPromise;
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch {
      forceLogout();
      return Promise.reject(err);
    }
  }
);

export default api;