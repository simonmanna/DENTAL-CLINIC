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
      CONSULTATION: 'bg-blue-100 text-blue-800 border-blue-200',
      PROCEDURE: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      DIAGNOSTIC: 'bg-purple-100 text-purple-800 border-purple-200',
      SURGICAL: 'bg-red-100 text-red-800 border-red-200',
      PREVENTIVE: 'bg-green-100 text-green-800 border-green-200',
      MEDICATION: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    };
    return colors[category] || 'bg-slate-100 text-slate-800 border-slate-200';
  };

  const getTypeIcon = (type: string) => {
    // Return appropriate icons based on type
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-lg border border-sky-100 shadow-sm flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search services..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                onSearch(e.target.value);
              }}
              className="pl-9 border-slate-200 focus:border-sky-500 focus:ring-sky-500"
            />
          </div>
          <Select onValueChange={(val) => onFilterChange({ category: val })}>
            <SelectTrigger className="w-[180px] border-slate-200">
              <Filter className="h-4 w-4 mr-2 text-slate-500" />
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
        
        <div className="text-sm text-slate-500">
          Showing {services.length} services
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-sky-100 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-sky-50/50">
            <TableRow className="border-b border-sky-100 hover:bg-sky-50/80">
              <TableHead className="w-12"></TableHead>
              <TableHead className="text-sky-900 font-semibold">
                <div className="flex items-center gap-1">
                  Code & Name
                  <ArrowUpDown className="h-3 w-3 text-sky-600" />
                </div>
              </TableHead>
              <TableHead className="text-sky-900 font-semibold">Category</TableHead>
              <TableHead className="text-sky-900 font-semibold text-right">Price (UGX)</TableHead>
              <TableHead className="text-sky-900 font-semibold">Status</TableHead>
              <TableHead className="text-sky-900 font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600"></div>
                    Loading services...
                  </div>
                </TableCell>
              </TableRow>
            ) : services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-4 bg-slate-50 rounded-full">
                      <Search className="h-6 w-6 text-slate-400" />
                    </div>
                    <p>No billing services found</p>
                    <p className="text-sm text-slate-400">Try adjusting your search or filters</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              services.map((service) => (
                <TableRow 
                  key={service.id} 
                  className="border-b border-slate-100 hover:bg-sky-50/30 transition-colors"
                >
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onToggleFavorite(service.id)}
                    >
                      {service.isFavorite ? (
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      ) : (
                        <StarOff className="h-4 w-4 text-slate-400" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium text-slate-900 flex items-center gap-2">
                        {service.name}
                        {service.isFavorite && (
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">
                            Favorite
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-xs">
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
                  <TableCell className="text-right font-mono text-slate-700">
                    {formatCurrency(service.price)}
                    {service.defaultTaxAmount > 0 && (
                      <div className="text-xs text-slate-500">
                        + {formatCurrency(service.defaultTaxAmount)} tax
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={service.isActive ? 'default' : 'secondary'}
                      className={service.isActive 
                        ? 'bg-green-100 text-green-800 hover:bg-green-100 border-green-200' 
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                      }
                    >
                      {service.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => onEdit(service)} className="cursor-pointer">
                          <Pencil className="mr-2 h-4 w-4 text-sky-600" />
                          Edit Service
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDuplicate(service.id)} className="cursor-pointer">
                          <Copy className="mr-2 h-4 w-4 text-slate-600" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => onDelete(service.id)} 
                          className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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