// src/pages/locations/index.tsx (or your route file)
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LocationsTable } from './components/locations-table';
import { LocationForm } from './components/location-form';
import { 
  useLocations, 
  useCreateLocation,    // ✅ Add this
  useUpdateLocation,    // ✅ Add this
  useDeleteLocation,    // ✅ Add this
} from '@/hooks/use-locations';
import { Location } from '@/types/location';

export default function LocationsPage() {
  const { data: locations, isLoading, refetch } = useLocations(); // returns Location[]
  // ✅ Initialize mutation hooks
  const createMutation = useCreateLocation();
  const updateMutation = useUpdateLocation();
  const deleteMutation = useDeleteLocation();

  const [editingLocation, setEditingLocation] = useState<Location | undefined>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  

  const handleCreate = () => {
    setEditingLocation(undefined);
    setIsDialogOpen(true);
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setIsDialogOpen(true);
  };

const handleSubmit = async (values: any) => {
  if (createMutation.isPending || updateMutation.isPending) return; // Prevent double-submit
  
  try {
    if (editingLocation) {
      await updateMutation.mutateAsync({ id: editingLocation.id, ...values });
    } else {
      await createMutation.mutateAsync(values);
    }
    setIsDialogOpen(false);
    refetch();
  } catch (err: any) {
    // Error already handled by React Query onError callback if configured
  }
};

const handleDelete = async (id: string) => {
  if (confirm('Are you sure you want to delete this location?')) {
    try {
      // ✅ Delete: pass just the id
      await deleteMutation.mutateAsync(id);
      // Optional: toast.success('Location deleted');
      refetch();
    } catch (err: any) {
      console.error('Failed to delete location:', err);
      // Optional: toast.error(err.message);
    }
  }
};

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Locations</h1>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add Location
        </Button>
      </div>

      <LocationsTable
        locations={locations || []}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingLocation ? 'Edit Location' : 'Create Location'}
            </DialogTitle>
          </DialogHeader>
          <LocationForm
            location={editingLocation}
            allLocations={locations || []}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}