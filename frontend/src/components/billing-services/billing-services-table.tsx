// src/components/billing-services/billing-services-table.tsx
'use client';

import { useState } from 'react';
import { BillingService } from '@/types/billing-service';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  MoreHorizontal, 
  Star, 
  StarOff, 
  Copy, 
  Pencil, 
  Trash2, 
  Search,
  Filter,
  ArrowUpDown
} from 'lucide-react';
import { ActionButton, RowActions } from "@/components/ui/action-button";
import { formatCurrency } from '@/lib/utils';

interface BillingServicesTableProps {
  services: BillingService[];
  isLoading: boolean;
  onEdit: (service: BillingService) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onDuplicate: (id: string) => void;
  onSearch: (query: string) => void;
  onFilterChange: (filters: { category?: string; isActive?: boolean }) => void;
}

export function BillingServicesTable({
  services,
  isLoading,
  onEdit,
  onDelete,
  onToggleFavorite,
  onDuplicate,
  onSearch,
  onFilterChange,
}: BillingServicesTableProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      CONSULTATION: 'bg-primary-muted text-primary border-primary/25',
      PROCEDURE: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      DIAGNOSTIC: 'bg-purple-100 text-purple-800 border-purple-200',
      SURGICAL: 'bg-danger-muted text-danger border-danger/25',
      PREVENTIVE: 'bg-success-muted text-success border-success/25',
      MEDICATION: 'bg-warning-muted text-warning border-warning/25',
    };
    return colors[category] || 'bg-muted text-foreground border-border';
  };

  const getTypeIcon = (type: string) => {
    // Return appropriate icons based on type
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-lg border border-primary/20 shadow-sm flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
            <Input
              placeholder="Search services..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                onSearch(e.target.value);
              }}
              className="pl-9 border-border focus:border-primary/60 focus:ring-primary/60"
            />
          </div>
          <Select onValueChange={(val) => onFilterChange({ category: val })}>
            <SelectTrigger className="w-[180px] border-border">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="CONSULTATION">Consultation</SelectItem>
              <SelectItem value="PROCEDURE">Procedure</SelectItem>
              <SelectItem value="DIAGNOSTIC">Diagnostic</SelectItem>
              <SelectItem value="SURGICAL">Surgical</SelectItem>
              <SelectItem value="PREVENTIVE">Preventive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="text-sm text-muted-foreground">
          Showing {services.length} services
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-primary/20 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-primary-muted/50">
            <TableRow className="border-b border-primary/20 hover:bg-primary-muted/80">
              <TableHead className="w-12"></TableHead>
              <TableHead className="text-primary font-semibold">
                <div className="flex items-center gap-1">
                  Code & Name
                  <ArrowUpDown className="h-3 w-3 text-primary" />
                </div>
              </TableHead>
              <TableHead className="text-primary font-semibold">Category</TableHead>
              <TableHead className="text-primary font-semibold text-right">Price (UGX)</TableHead>
              <TableHead className="text-primary font-semibold">Status</TableHead>
              <TableHead className="text-primary font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    Loading services...
                  </div>
                </TableCell>
              </TableRow>
            ) : services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-4 bg-muted/50 rounded-full">
                      <Search className="h-6 w-6 text-muted-foreground/70" />
                    </div>
                    <p>No billing services found</p>
                    <p className="text-sm text-muted-foreground/70">Try adjusting your search or filters</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              services.map((service) => (
                <TableRow 
                  key={service.id} 
                  className="border-b border-border/60 hover:bg-primary-muted/30 transition-colors"
                >
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onToggleFavorite(service.id)}
                    >
                      {service.isFavorite ? (
                        <Star className="h-4 w-4 fill-warning/70 text-warning/70" />
                      ) : (
                        <StarOff className="h-4 w-4 text-muted-foreground/70" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium text-foreground flex items-center gap-2">
                        {service.name}
                        {service.isFavorite && (
                          <Badge variant="secondary" className="bg-warning-muted text-warning text-xs">
                            Favorite
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">
                          {service.serviceCode}
                        </span>
                        <span>•</span>
                        <span className="text-xs">{service.type}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getCategoryColor(service.category)}>
                      {service.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-foreground">
                    {formatCurrency(service.price)}
                    {service.defaultTaxAmount > 0 && (
                      <div className="text-xs text-muted-foreground">
                        + {formatCurrency(service.defaultTaxAmount)} tax
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={service.isActive ? 'default' : 'secondary'}
                      className={service.isActive 
                        ? 'bg-success-muted text-success hover:bg-success-muted border-success/25' 
                        : 'bg-muted text-muted-foreground border-border'
                      }
                    >
                      {service.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions>
                      <ActionButton iconOnly tone="edit" label="Edit service" onClick={() => onEdit(service)} />
                      <ActionButton iconOnly tone="info" label="Duplicate" icon={Copy} onClick={() => onDuplicate(service.id)} />
                      <ActionButton iconOnly tone="delete" label="Delete" onClick={() => onDelete(service.id)} />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}