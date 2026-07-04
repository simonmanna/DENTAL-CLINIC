// src/app/(dashboard)/billing-services/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { BillingService, BillingServiceFilters } from '@/types/billing-service';
import { billingServiceApi } from '@/lib/api/billing-services';
import { BillingServicesTable } from '@/components/billing-services/billing-services-table';
import { BillingServiceForm } from '@/components/billing-services/billing-service-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export default function BillingServicesPage() {
  const [services, setServices] = useState<BillingService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<BillingService | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<BillingServiceFilters>({});

  const fetchServices = async () => {
    try {
      setIsLoading(true);
      const response = await billingServiceApi.getAll({ 
        take: 50,
        ...filters 
      });
      setServices(response.data);
    } catch (error) {
      toast.error('Failed to load billing services');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, [filters]);

  const handleCreate = async (data: any) => {
    try {
      await billingServiceApi.create(data);
      toast.success('Billing service created successfully');
      setIsFormOpen(false);
      fetchServices();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create service');
    }
  };

  const handleUpdate = async (data: any) => {
    if (!editingService) return;
    try {
      await billingServiceApi.update(editingService.id, data);
      toast.success('Billing service updated successfully');
      setEditingService(null);
      fetchServices();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update service');
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await billingServiceApi.delete(deletingId);
      toast.success('Billing service deleted successfully');
      setDeletingId(null);
      fetchServices();
    } catch (error) {
      toast.error('Failed to delete service');
    }
  };

  const handleToggleFavorite = async (id: string) => {
    try {
      await billingServiceApi.toggleFavorite(id);
      fetchServices();
    } catch (error) {
      toast.error('Failed to update favorite status');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await billingServiceApi.duplicate(id);
      toast.success('Service duplicated successfully');
      fetchServices();
    } catch (error) {
      toast.error('Failed to duplicate service');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-2 space-y-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-2 rounded-xl border border-sky-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-sky-600" />
            Billing Services
          </h1>
          <p className="text-slate-500 mt-1">
            Manage consultation fees, procedures, and service pricing
          </p>
        </div>
        <Button 
          onClick={() => setIsFormOpen(true)}
          className="bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Service
        </Button>
      </div>

      {/* Table */}
      <BillingServicesTable
        services={services}
        isLoading={isLoading}
        onEdit={(service) => setEditingService(service)}
        onDelete={(id) => setDeletingId(id)}
        onToggleFavorite={handleToggleFavorite}
        onDuplicate={handleDuplicate}
        onSearch={(search) => setFilters(prev => ({ ...prev, search }))}
        onFilterChange={(newFilters) => setFilters(prev => ({ ...prev, ...newFilters }))}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen || !!editingService} onOpenChange={(open) => {
        if (!open) {
          setIsFormOpen(false);
          setEditingService(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-100 pb-4">
            <DialogTitle className="text-xl text-sky-900">
              {editingService ? 'Edit Billing Service' : 'Create Billing Service'}
            </DialogTitle>
          </DialogHeader>
          <div className="pt-4">
            <BillingServiceForm
              initialData={editingService || undefined}
              onSubmit={editingService ? handleUpdate : handleCreate}
              onCancel={() => {
                setIsFormOpen(false);
                setEditingService(null);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Billing Service?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the billing service
              and remove it from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}