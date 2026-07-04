// src/lib/api.ts

import axios from "axios";

// const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/v1';
// const API_BASE = import.meta.env?.VITE_API_URL || "http://localhost:3001";
const API_BASE = (import.meta as any).env?.VITE_API_URL || "http://localhost:3001";


export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

export default api;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem("refresh_token");
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
          refreshToken: refresh,
        });
        localStorage.setItem("access_token", data.accessToken);
        localStorage.setItem("refresh_token", data.refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  },
);


export const suppliersApi = {
  /** Get all suppliers with optional search */
  getAll: (search?: string) =>
    api.get("/suppliers", { params: { search } }).then((r) => r.data),

  getSuppliers: (search?: string) =>
    api.get("/suppliers", { params: { search } }).then((r) => r.data),
  
  /** Get single supplier by ID */
  getById: (id: string) =>
    api.get(`/suppliers/${id}`).then((r) => r.data),
  
  /** Create new supplier */
  create: (data: any) =>
    api.post("/suppliers", data).then((r) => r.data),
  
  /** Update supplier */
  update: (id: string, data: any) =>
    api.patch(`/suppliers/${id}`, data).then((r) => r.data),
  
  /** Delete/deactivate supplier */
  delete: (id: string) =>
    api.delete(`/suppliers/${id}`).then((r) => r.data),
};