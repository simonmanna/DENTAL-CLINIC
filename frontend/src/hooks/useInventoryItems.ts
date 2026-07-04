import { useQuery } from "@tanstack/react-query";
import api from '@/lib/api/client';

export interface InventoryItemOption {
  id: string;
  name: string;
  itemCode: string;
  quantity: number;
}

export function useInventoryItems() {
  return useQuery({
    queryKey: ["inventory-items", "dropdown"],
    queryFn: async () => {
      const res = await api.get("/inventory");
      return (res.data?.data ?? []) as InventoryItemOption[];
    },
  });
}