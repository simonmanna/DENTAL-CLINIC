import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from "react-router-dom";
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from '@/components/ui/pagination';
import { pharmacySalesApi } from '@/services/pharmacy-sales.api';
import { PharmacySalesStats } from './components/PharmacySalesStats';
import { PharmacySalesFilters } from './components/PharmacySalesFilters';
import { PharmacySalesTable } from './components/PharmacySalesTable';
import { SalesFilters, PharmacySale, SalesStats } from '@/types/pharmacy-sales';
import { toast } from 'sonner';
import { RefreshCw, Plus, FileDown, LayoutDashboard } from 'lucide-react';

export default function PharmacySalesList() {
  const [searchParams] = useSearchParams();
  
  const [sales, setSales] = useState<PharmacySale[]>([]);
  const [stats, setStats] = useState<SalesStats>();
  const [meta, setMeta] = useState<{ total: number; page: number; limit: number; totalPages: number }>();
  const [isLoading, setIsLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  
  const [filters, setFilters] = useState<SalesFilters>({
    page: 1,
    limit: 20,
    ...Object.fromEntries(searchParams?.entries() || []),
  });

  const fetchSales = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await pharmacySalesApi.getSales(filters);
      setSales(response.data);
      setMeta({
        total: response.meta.total,
        page: response.meta.page,
        limit: response.meta.limit,
        totalPages: Math.ceil(response.meta.total / response.meta.limit),
      });
    } catch (error) {
      toast.error('Failed to load sales');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  const fetchStats = useCallback(async () => {
    setIsStatsLoading(true);
    try {
      const response = await pharmacySalesApi.getStats(
        filters.locationId,
        filters.dateFrom,
        filters.dateTo
      );
      setStats(response);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setIsStatsLoading(false);
    }
  }, [filters.locationId, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    fetchSales();
    fetchStats();
  }, [fetchSales, fetchStats]);

  const handleFilterChange = (newFilters: Partial<SalesFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handleResetFilters = () => setFilters({ page: 1, limit: 20 });
  const handlePageChange = (page: number) => setFilters(prev => ({ ...prev, page }));

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 bg-slate-50/50 min-h-screen">
      
      {/* Header Section: Condensed & Professional */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <LayoutDashboard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Pharmacy Sales</h1>
            <p className="text-xs text-muted-foreground">Transaction overview and management</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {}} className="hidden md:flex">
            <FileDown className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={fetchSales} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        </div>
      </div>

      {/* Stats Summary: Ensure these are "Mini" cards inside the Stats component */}
      <PharmacySalesStats 
        stats={stats} 
        isLoading={isStatsLoading}
        dateRange={{ from: filters.dateFrom, to: filters.dateTo }}
      />

      {/* Main Content Card */}
      <Card className="shadow-sm border-none bg-white">
        <CardContent className="p-0">
          {/* Integrated Filter Bar */}
          <div className="p-3 border-b bg-slate-50/30">
            <PharmacySalesFilters 
              onFilterChange={handleFilterChange}
              onReset={handleResetFilters}
            />
          </div>

          {/* Table Container */}
          <div className="min-h-[400px]">
            <PharmacySalesTable 
              sales={sales}
              isLoading={isLoading}
              onRefresh={fetchSales}
              onAddPayment={() => {}}
              onRefund={() => {}}
            />
          </div>

          {/* Integrated Footer: Pagination + Meta */}
          <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 gap-4 border-t">
            {!isLoading && meta && (
              <p className="text-xs font-medium text-muted-foreground">
                Showing <span className="text-foreground">{(meta.page - 1) * meta.limit + 1}</span> to <span className="text-foreground">{Math.min(meta.page * meta.limit, meta.total)}</span> of <span className="text-foreground">{meta.total}</span> entries
              </p>
            )}

            {meta && meta.totalPages > 1 && (
              <Pagination className="justify-end w-auto mx-0">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => handlePageChange(Math.max(1, meta.page - 1))}
                      className={`h-8 px-2 cursor-pointer ${meta.page === 1 ? 'pointer-events-none opacity-50' : ''}`}
                    />
                  </PaginationItem>
                  
                  <div className="flex items-center -space-x-px">
                     {[...Array(Math.min(3, meta.totalPages))].map((_, i) => {
                        const pageNum = i + 1; // Simplified for brevity
                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              isActive={pageNum === meta.page}
                              onClick={() => handlePageChange(pageNum)}
                              className="h-8 w-8 cursor-pointer"
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                  </div>

                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => handlePageChange(Math.min(meta.totalPages, meta.page + 1))}
                      className={`h-8 px-2 cursor-pointer ${meta.page === meta.totalPages ? 'pointer-events-none opacity-50' : ''}`}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}