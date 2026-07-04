import { api } from "./client";
import type { PaymentFilters, Payment } from "@/types/payment";

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const paymentsApi = {

  getAll: async (params?: PaymentFilters): Promise<PaginatedResponse<Payment>> => {
    const response = await api.get('/payments', { params });
    return response.data; // Ensure backend returns { data: [...], meta: {...} }
  },
  /** Get all payments with filters */
  // getAll: (filters?: PaymentFilters) => {
  //   const cleanParams = Object.fromEntries(
  //     Object.entries(filters || {}).filter(
  //       ([_, value]) =>
  //         value !== undefined &&
  //         value !== null &&
  //         value !== "" &&
  //         value !== "undefined"
  //     )
  //   );
  //   return api.get<Payment[]>("/payments", { params: cleanParams }).then((r) => r.data);
  // },

  /** Get single payment by ID */
  getOne: (id: string) =>
    api.get<Payment>(`/payments/${id}`).then((r) => r.data),
};