// src/hooks/usePurchase.ts
import api from "@/lib/api/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";


// src/lib/api.ts - Add these methods

export const purchaseApi = {
  // ... existing methods ...
  
  createDelivery: async (data: any) => {
    const response = await api.post('/purchases/deliveries', data);
    return response.data;
  },
  
  getDeliveries: async (purchaseOrderId: string) => {
    const response = await api.get(`/purchases/orders/${purchaseOrderId}/deliveries`);
    return response.data;
  },
  
  getDelivery: async (id: string) => {
    const response = await api.get(`/purchases/deliveries/${id}`);
    return response.data;
  },
  
  getLocationStock: async (locationId: string, itemType?: string) => {
    const response = await api.get(`/purchases/locations/${locationId}/stock`, {
      params: { itemType },
    });
    return response.data;
  },
};
// ─── Dashboard ────────────────────────────────────────────
export const usePurchaseDashboard = () =>
  useQuery({
    queryKey: ["purchases", "dashboard"],
    queryFn: () => api.get("/purchases/dashboard").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

// ─── Orders ───────────────────────────────────────────────
// FIXED: Better param handling and error logging
export const usePurchaseOrders = (params?: Record<string, any>) => {
  // Clean up params - remove undefined/null values
  const cleanParams = params
    ? Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v != null && v !== ""),
      )
    : {};

  return useQuery({
    queryKey: ["purchases", "orders", cleanParams],
    queryFn: async () => {
      console.log("Fetching orders with params:", cleanParams);
      try {
        const response = await api.get("/purchases/orders", {
          params: cleanParams,
        });
        console.log("Orders response:", response.data);
        return response.data;
      } catch (error: any) {
        console.error(
          "Error fetching orders:",
          error.response?.data || error.message,
        );
        throw error;
      }
    },
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: (previousData) => previousData, // Keep old data while fetching
  });
};

// GET /purchases/orders/:id
export const usePurchaseOrder = (id: string) =>
  useQuery({
    queryKey: ["purchases", "orders", id],
    queryFn: () => api.get(`/purchases/orders/${id}`).then((r) => r.data),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

// ─── Mutations ────────────────────────────────────────────

export const useCreatePurchaseOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      api.post("/purchases/orders", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
  });
};

export const useUpdatePurchaseOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.put(`/purchases/orders/${id}`, data).then((r) => r.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchases", "orders", variables.id] });
    },
  });
};

export const useSubmitPurchaseOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.patch(`/purchases/orders/${id}/submit`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
  });
};

export const useApprovePurchaseOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: any }) =>
      api.patch(`/purchases/orders/${id}/approve`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
  });
};

export const useCancelPurchaseOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.patch(`/purchases/orders/${id}/cancel`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
  });
};

// ─── Deliveries ───────────────────────────────────────────
// export const useCreateDelivery = () => {
//   const qc = useQueryClient();
//   return useMutation({
//     mutationFn: (data: any) =>
//       api.post("/purchases/deliveries", data).then((r) => r.data),
//     onSuccess: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
//   });
// };

// ─── Payments ─────────────────────────────────────────────
export const usePurchasePayments = (purchaseOrderId: string) =>
  useQuery({
    queryKey: ["purchases", "payments", purchaseOrderId],
    queryFn: () =>
      api
        .get(`/purchases/orders/${purchaseOrderId}/payments`)
        .then((r) => r.data),
    enabled: !!purchaseOrderId,
  });

export const useCreatePurchasePayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      api.post("/purchases/payments", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
  });
};

// ─── Stock Adjustments ────────────────────────────────────
export const useStockAdjustments = (params?: any) =>
  useQuery({
    queryKey: ["purchases", "adjustments", params],
    queryFn: () =>
      api.get("/purchases/adjustments", { params }).then((r) => r.data),
  });

export const useCreateStockAdjustment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      api.post("/purchases/adjustments", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
  });
};

// ─── Waste ────────────────────────────────────────────────
export const useWasteRecords = (params?: any) =>
  useQuery({
    queryKey: ["purchases", "waste", params],
    queryFn: () => api.get("/purchases/waste", { params }).then((r) => r.data),
  });

export const useCreateWasteRecord = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      api.post("/purchases/waste", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
  });
};

// ─── Stock Logs ───────────────────────────────────────────
export const useStockLogs = (params?: any) =>
  useQuery({
    queryKey: ["purchases", "stock-logs", params],
    queryFn: () =>
      api.get("/purchases/stock-logs", { params }).then((r) => r.data),
  });

// ─── Suppliers ────────────────────────────────────────────
export const useSuppliers = () =>
  useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const endpoints = [
        "/suppliers",
        "/inventory/suppliers",
        "/purchases/suppliers",
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await api.get(endpoint);
          const data = response.data;

          // Normalize different possible API shapes
          if (Array.isArray(data)) return data;
          if (data?.data && Array.isArray(data.data)) return data.data;
          if (data?.suppliers && Array.isArray(data.suppliers))
            return data.suppliers;

          console.warn(`Unexpected response format from ${endpoint}:`, data);
        } catch (e: any) {
          if (e.response?.status !== 404) {
            console.error(`Error on endpoint ${endpoint}:`, e);
          }
        }
      }

      return []; // fallback
    },
    staleTime: 5 * 60 * 1000,
    // Optional: retry only on real errors
    retry: (failureCount, error: any) => {
      return failureCount < 2 && error?.response?.status !== 404;
    },
  });
// export const useSuppliers = () =>
//   useQuery({
//     queryKey: ["suppliers"],
//     queryFn: async () => {
//       try {
//         // Try multiple possible endpoints
//         const endpoints = ["/suppliers", "/inventory/suppliers", "/purchases/suppliers"];
//         for (const endpoint of endpoints) {
//           try {
//             const response = await api.get(endpoint);
//             return response.data;
//           } catch (e: any) {
//             if (e.response?.status !== 404) throw e;
//           }
//         }
//         return [];
//       } catch (error: any) {
//         console.error("Error fetching suppliers:", error);
//         return [];
//       }
//     },
//     staleTime: 5 * 60 * 1000,
//   });

// ─── Locations ────────────────────────────────────────────
export const useLocations = () =>
  useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      try {
        const response = await api.get("/locations");
        return response.data;
      } catch (error: any) {
        console.error("Error fetching locations:", error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

// ─── Inventory Items ──────────────────────────────────────
export const useInventoryItems = (params?: any) =>
  useQuery({
    queryKey: ["inventory", "items", params],
    queryFn: async () => {
      try {
        const response = await api.get("/inventory/items", { params });
        return response.data;
      } catch (error: any) {
        console.error("Error fetching inventory items:", error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });


  // src/hooks/usePurchase.ts - Add this hook

// import { useMutation, useQueryClient } from "@tanstack/react-query";
// import { purchaseApi } from "@/lib/api";
import { toast } from "sonner";

// export const useCreateDelivery = () => {
//   const qc = useQueryClient();
//   return useMutation({
//     mutationFn: (data: any) =>
//       api.post("/purchases/deliveries", data).then((r) => r.data),
//     onSuccess: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
//   });
// };

// export const useCreateDelivery = () => {
//   const queryClient = useQueryClient();
  
//   return useMutation({
//     mutationFn: purchaseApi.createDelivery,
//     onSuccess: () => {
//       queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
//       queryClient.invalidateQueries({ queryKey: ["deliveries"] });
//       queryClient.invalidateQueries({ queryKey: ["inventory"] });
//       queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
//     },
//   });
// };

export const usePurchaseOrderDeliveries = (purchaseOrderId: string) => {
  return useQuery({
    queryKey: ["deliveries", purchaseOrderId],
    queryFn: () => purchaseApi.getDeliveries(purchaseOrderId),
    enabled: !!purchaseOrderId,
  });
};

// src/hooks/usePurchase.ts

// export const useCreateDelivery = () => {
//   const queryClient = useQueryClient();
  
//   return useMutation({
//     mutationFn: purchaseApi.createDelivery,
//     onSuccess: () => {
//       queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
//       queryClient.invalidateQueries({ queryKey: ["deliveries"] });
//       queryClient.invalidateQueries({ queryKey: ["inventory"] });
//     },
//   });
// };

// export const useLocations = () => {
//   return useQuery({
//     queryKey: ["locations"],
//     queryFn: purchaseApi.getLocations,
//   });
// };

// src/hooks/usePurchase.ts
export const useCreateDelivery = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/purchases/deliveries', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    },
    onError: (error) => {
      console.error("useCreateDelivery error:", error);
    }
  });
};