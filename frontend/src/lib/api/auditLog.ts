// src/lib/api/auditLog.ts
// Read-only client for the global /audit-log endpoints.
// Writes happen inside the modules that own each audited entity.
import api from "@/lib/api/client";

export interface AuditLogRow {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  module: string;
  entityType: string | null;
  recordId: string | null;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  oldData: unknown | null;
  newData: unknown | null;
  createdAt: string;
}

export interface AuditLogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuditLogListResponse {
  data: AuditLogRow[];
  pagination: AuditLogPagination;
}

export interface AuditLogFacets {
  modules: string[];
  actions: string[];
  entityTypes: string[];
  users: { id: string; name: string }[];
}

export interface AuditLogListParams {
  module?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  recordId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "module" | "action" | "entityType" | "userName";
  sortDir?: "asc" | "desc";
}

function buildParams(p: AuditLogListParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const k of Object.keys(p) as (keyof AuditLogListParams)[]) {
    const v = p[k];
    if (v === undefined || v === null || v === "") continue;
    out[k] = v as any;
  }
  return out;
}

export const auditLogApi = {
  list: async (params: AuditLogListParams = {}): Promise<AuditLogListResponse> => {
    const res = await api.get("/audit-log", { params: buildParams(params) });
    return res.data;
  },
  facets: async (): Promise<AuditLogFacets> => {
    const res = await api.get("/audit-log/facets");
    return res.data;
  },
  getOne: async (id: string): Promise<AuditLogRow> => {
    const res = await api.get(`/audit-log/${id}`);
    return res.data;
  },
};
