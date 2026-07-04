// src/pages/drug-categories/DrugCategoryTable.tsx
import { useState } from 'react';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuTrigger, DropdownMenuSeparator 
} from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal, Edit, Trash2, Search, Hash, FileText
} from 'lucide-react';
import { DrugCategory } from '@/lib/api/drug-categories';
import { cn } from '@/lib/utils';

interface DrugCategoryTableProps {
  categories: DrugCategory[];
  onEdit: (category: DrugCategory) => void;
  onDelete: (id: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function DrugCategoryTable({ 
  categories, 
  onEdit, 
  onDelete,
  searchQuery = '',
  onSearchChange,
}: DrugCategoryTableProps) {

  const filtered = categories.filter(cat => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      cat.name.toLowerCase().includes(q) ||
      cat.code?.toLowerCase().includes(q) ||
      cat.description?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col">
      {/* Search Bar */}
      {onSearchChange && (
        <div className="p-4 bg-white flex items-center justify-between border-b">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <span className="text-sm text-gray-500">
            {filtered.length} of {categories.length}
          </span>
        </div>
      )}
      
      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length > 0 ? (
              filtered.map((cat) => (
                <TableRow key={cat.id} className="hover:bg-gray-50">
                  {/* Name */}
                  <TableCell className="font-medium">
                    {cat.name}
                  </TableCell>

                  {/* Code */}
                  <TableCell>
                    {cat.code ? (
                      <span className="inline-flex items-center gap-1 text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                        <Hash className="h-3 w-3" />
                        {cat.code}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </TableCell>

                  {/* Description */}
                  <TableCell className="max-w-md">
                    <span className="text-sm text-gray-500 truncate block">
                      {cat.description || 'No description'}
                    </span>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <Badge 
                      variant={cat.isActive ? "default" : "secondary"}
                      className={cn(
                        "text-xs font-semibold",
                        cat.isActive 
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" 
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      )}
                    >
                      {cat.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(cat)}>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-red-600 focus:text-red-600"
                          onClick={() => onDelete(cat.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-gray-400">
                  {searchQuery ? 'No categories match your search' : 'No categories found'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}