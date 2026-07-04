// src/pages/locations/components/locations-table.tsx
'use client';

import { Location, LocationType } from '@/types/location';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2 } from 'lucide-react';

const locationTypeLabels: Record<LocationType, string> = {
  [LocationType.MAIN_CLINIC]: 'Main Clinic',
  [LocationType.BRANCH]: 'Branch',
  [LocationType.STORAGE]: 'Storage',
  [LocationType.PHARMACY]: 'Pharmacy',
  [LocationType.LAB]: 'Laboratory',
  [LocationType.RECEPTION]: 'Reception',
  [LocationType.WAREHOUSE]: 'Warehouse',
  [LocationType.MOBILE_UNIT]: 'Mobile Unit',
  [LocationType.STORE]: 'Store',
  [LocationType.CLINIC]: 'Clinic',
  [LocationType.DISPENSARY]: 'Dispensary',
};

interface LocationsTableProps {
  locations: Location[];
  onEdit: (location: Location) => void;
  onDelete: (id: string) => void;
}

export function LocationsTable({ locations, onEdit, onDelete }: LocationsTableProps) {
  // Find parent name if needed (optional)
  const getParentName = (parentId: string | null) => {
    if (!parentId) return '—';
    const parent = locations.find(l => l.id === parentId);
    return parent ? parent.name : 'Unknown';
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Parent</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No locations found.
              </TableCell>
            </TableRow>
          ) : (
            locations.map((location) => (
              <TableRow key={location.id}>
                <TableCell className="font-medium">{location.name}</TableCell>
                <TableCell>{locationTypeLabels[location.type]}</TableCell>
                <TableCell>{getParentName(location.parentId)}</TableCell>
                <TableCell>{location.phone || '—'}</TableCell>
                <TableCell>
                  <Badge variant={location.isActive ? 'default' : 'secondary'}>
                    {location.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(location)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(location.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}