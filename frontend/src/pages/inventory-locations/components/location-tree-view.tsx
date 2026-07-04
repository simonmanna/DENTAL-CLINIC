'use client';

import { useState } from 'react';
import { LocationTreeNode, LocationType } from '@/types/location';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronDown, MoreVertical, Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Eye, Pencil, Check, Trash2, PlusCircle } from "lucide-react";


// Helper for type icons (Keep your existing mapping or use this condensed version)
import { Building2, Warehouse, Store, Home, Truck, FlaskConical, Pill, Package } from 'lucide-react';

const typeIcons: Record<string, React.ReactNode> = {
  [LocationType.WAREHOUSE]: <Warehouse className="h-3.5 w-3.5" />,
  [LocationType.PHARMACY]: <Pill className="h-3.5 w-3.5" />,
  [LocationType.LAB]: <FlaskConical className="h-3.5 w-3.5" />,
  // ... rest of your mapping
};

interface LocationTreeViewProps {
  locations: LocationTreeNode[];
  selectedId?: string;
  onSelect: (location: LocationTreeNode) => void;
  onEdit: (location: LocationTreeNode) => void;
  onDelete: (location: LocationTreeNode) => void;
  onAddChild: (parentId: string) => void;
  level?: number;
}

export function LocationTreeView({
  locations,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onAddChild,
  level = 0,
}: LocationTreeViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expanded);
    newExpanded.has(id) ? newExpanded.delete(id) : newExpanded.add(id);
    setExpanded(newExpanded);
  };

  if (!locations?.length) return null;

  return (
    <div className={cn("space-y-1", level > 0 && "ml-4 border-l border-muted/50 pl-2")}>
      {locations.map((location) => {
        const hasChildren = location.children?.length > 0;
        const isExpanded = expanded.has(location.id);
        const isSelected = selectedId === location.id;

        return (
          <div key={location.id}>
            <div
              className={cn(
                'bg-accent/50 group flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all border border-transparent',
                'hover:bg-accent/50 hover:border-accent-foreground/10',
                isSelected && 'bg-primary/5 border-primary/20 shadow-sm'
              )}
              onClick={() => onSelect(location)}
            >
              <button
                onClick={(e) => hasChildren && toggleExpand(location.id, e)}
                className={cn(
                  'w-5 h-5 flex items-center justify-center rounded transition-colors',
                  !hasChildren && 'invisible',
                  isExpanded ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {isExpanded ? <ChevronDown className="h-6 w-8" /> : <ChevronRight className="h-6 w-8" />}
              </button>

              <div className="flex-1 flex items-center gap-2 overflow-hidden">
                <span className={cn("font-medium text-sm truncate", isSelected && "text-primary")}>
                  {location.name}
                </span>
                {location.isDefault && <Badge variant="outline" className="h-5 text-[10px] px-1 bg-blue-50">Default</Badge>}
              </div>

              <div className="flex items-center gap-1 opacity-100 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                  onClick={(e) => { e.stopPropagation(); onAddChild(location.id); }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>

                 <Button
                    title="Edit Details"
                    className="mx-1 h-6 w-8 rounded-md bg-amber-500 p-0 text-white hover:bg-amber-600 shadow-sm"
                    onClick={() => onEdit(location)}
                  >
                    <Pencil size={16} strokeWidth={3} />
                  </Button>

                  <Button
                    title="Delete Location"
                    className="h-6 w-8 rounded-md bg-red-600 p-0 text-white hover:bg-red-700 shadow-sm"
                    onClick={() => onDelete(location)}
                    disabled={location._count?.children > 0}
                  >
                    <Trash2 size={16} strokeWidth={3} />
                  </Button>


                
                {/* <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem onClick={() => onEdit(location)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onDelete(location)}
                      className="text-destructive focus:bg-destructive/10"
                      disabled={location._count?.children > 0}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                 */}
              </div>
            </div>

            {hasChildren && isExpanded && (
              <LocationTreeView
                locations={location.children}
                selectedId={selectedId}
                onSelect={onSelect}
                onEdit={onEdit}
                onDelete={onDelete}
                onAddChild={onAddChild}
                level={level + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}