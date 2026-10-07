import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Folder,
  Tag,
  FileText,
  Building2,
  ToggleLeft,
  FolderTree,
  Eye,
} from 'lucide-react';
import { ActionButton, RowActions } from "@/components/ui/action-button";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { procedureCategoriesApi } from '../../lib/api';
import type { ProcedureCategory, CreateCategoryForm } from '../../types/procedure-categories';
import { RevenueAccountSelect } from '@/components/RevenueAccountSelect';

const COLORS = [
  '#4A90D9', '#50C878', '#F5A623', '#D0021B', '#9013FE',
  '#417505', '#BD10E0', '#7ED321', '#50E3C2', '#B8E986',
  '#F8E71C', '#F5A623', '#D0021B', '#8B572A', '#9B9B9B',
];

const getRandomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

type SortField = 'name' | 'code' | 'sortOrder' | 'createdAt';
type SortOrder = 'asc' | 'desc';

function CategoryForm({
  open,
  onClose,
  onSave,
  initialData,
  parentOptions,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: CreateCategoryForm) => void;
  initialData?: ProcedureCategory | null;
  parentOptions: ProcedureCategory[];
}) {
  const [form, setForm] = useState<CreateCategoryForm>({
    name: '',
    code: '',
    description: '',
    color: COLORS[0],
    icon: 'folder',
    parentId: null,
    isActive: true,
    sortOrder: 0,
    revenueAccountId: null,
  });

  useEffect(() => {
    if (initialData) {
      // Editing: preserve existing color
      setForm({
        name: initialData.name,
        code: initialData.code || '',
        description: initialData.description || '',
        color: initialData.color || getRandomColor(),
        icon: initialData.icon || 'folder',
        parentId: initialData.parentId,
        isActive: initialData.isActive,
        sortOrder: initialData.sortOrder || 0,
        revenueAccountId: initialData.revenueAccountId ?? null,
      });
    } else {
      // Creating new: assign random color automatically
      setForm({
        name: '',
        code: '',
        description: '',
        color: getRandomColor(),
        icon: 'folder',
        parentId: null,
        isActive: true,
        sortOrder: 0,
        revenueAccountId: null,
      });
    }
  }, [initialData, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-foreground flex items-center gap-2">
            {initialData ? (
              <>
                <Edit2 className="h-6 w-6 text-primary" />
                Edit Category
              </>
            ) : (
              <>
                <Plus className="h-6 w-6 text-primary" />
                Create New Category
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {initialData
              ? 'Update the details of this procedure category.'
              : 'Fill in the details below to create a new procedure category.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Basic Information Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Basic Information
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-foreground">
                  Category Name <span className="text-danger">*</span>
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Restorative, Orthodontics"
                  required
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">
                  A clear, descriptive name for this category
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code" className="text-sm font-medium text-foreground">
                  Category Code
                </Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. REST, ORTH"
                  className="h-10 font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Short identifier (auto-capitalized)
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="description" className="text-sm font-medium text-foreground">
                Description
              </Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description of what procedures belong in this category..."
                rows={1}
              />
            </div>
          </div>

          {/* Organization Section */}
          <div className="space-y-4">
            {/* <div className="flex items-center gap-2 pb-2 border-b border-border">
              <FolderTree className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Organization
              </h3>
            </div> */}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  Parent Category
                </Label>
                <Select
                  value={form.parentId || '__none__'}
                  onValueChange={(v) =>
                    setForm({ ...form, parentId: v === '__none__' ? null : v })
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="No parent (root category)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No parent (root)</SelectItem>
                    {parentOptions
                      .filter((c) => c.id !== initialData?.id)
                      .map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Leave empty for a top-level category
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  Status
                </Label>
                <div className="flex items-center h-10 px-3 border rounded-md bg-muted/50">
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                  />
                  <span className="ml-3 text-sm font-medium text-foreground">
                    {form.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <Badge
                    className={`ml-auto text-xs ${
                      form.isActive
                        ? 'bg-success-muted text-success'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {form.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Inactive categories won't appear in procedure selection
                </p>
              </div>
            </div>
          </div>

          {/* Revenue Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Revenue Settings
              </h3>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                Revenue Account
              </Label>
              <RevenueAccountSelect
                value={form.revenueAccountId}
                onChange={(v) => setForm({ ...form, revenueAccountId: v })}
                inheritLabel="Use system default (Treatment Revenue)"
              />
              <p className="text-xs text-muted-foreground">
                Procedures in this category post revenue here unless they set their own account.
              </p>
            </div>
          </div>


          <DialogFooter className="gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="px-6"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary text-white px-6 gap-2"
            >
              {initialData ? (
                <>
                  <Edit2 size={16} />
                  Update Category
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Create Category
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProcedureCategoriesPage() {
  const [categories, setCategories] = useState<ProcedureCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProcedureCategory | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const loadCategories = async () => {
    setLoading(true);
    try {
      const flat = await procedureCategoriesApi.getAll();
      setCategories(flat);
    } catch (err) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleSave = async (data: CreateCategoryForm) => {
    try {
      if (editingCategory) {
        await procedureCategoriesApi.update(editingCategory.id, data);
      } else {
        await procedureCategoriesApi.create(data);
      }
      setFormOpen(false);
      setEditingCategory(null);
      loadCategories();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save category');
    }
  };

  const handleDelete = async (category: ProcedureCategory) => {
    if (
      !confirm(
        `Delete "${category.name}"?\n\nThis cannot be undone if it has no procedures or sub-categories.`
      )
    ) {
      return;
    }

    try {
      await procedureCategoriesApi.delete(category.id);
      loadCategories();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete category');
    }
  };

  const getParentName = (parentId: string | null) => {
    if (!parentId) return '-';
    const parent = categories.find((c) => c.id === parentId);
    return parent?.name || '-';
  };

  const getRevenueAccountName = (accountId: string | null) => {
    if (!accountId) return 'System Default';
    return accountId;
  };

  const filteredAndSortedCategories = categories
    .filter((cat) => {
      const matchesSearch =
        cat.name.toLowerCase().includes(search.toLowerCase()) ||
        cat.code?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? cat.isActive
          : !cat.isActive;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'code':
          comparison = (a.code || '').localeCompare(b.code || '');
          break;
        case 'sortOrder':
          comparison = (a.sortOrder || 0) - (b.sortOrder || 0);
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    return sortOrder === 'asc' ? (
      <ChevronUp className="ml-2 h-4 w-4" />
    ) : (
      <ChevronDown className="ml-2 h-4 w-4" />
    );
  };

  return (
    <div className="flex flex-col h-full bg-muted/50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Procedure Categories
            </h1>
            <p className="text-sm text-muted-foreground">
              Organize procedures into categories and sub-categories
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingCategory(null);
              setFormOpen(true);
            }}
            className="bg-primary text-white hover:bg-primary shadow-sm gap-2"
          >
            <Plus size={16} /> New Category
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70"
            />
            <Input
              placeholder="Search by category, code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground/70">
            Loading categories...
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="border-b">
                  <TableHead className="w-[100px]">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort('code')}
                      className="font-semibold text-foreground bg-transparent p-0 h-auto"
                    >
                      CODE
                      <SortIcon field="code" />
                    </Button>
                  </TableHead>
                  <TableHead className="w-[250px]">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort('name')}
                      className="font-semibold text-foreground bg-transparent p-0 h-auto"
                    >
                      NAME
                      <SortIcon field="name" />
                    </Button>
                  </TableHead>
                  <TableHead className="w-[200px]">PARENT</TableHead>
                  <TableHead className="w-[100px] text-center">PROCS</TableHead>
                  <TableHead className="w-[120px]">STATUS</TableHead>
                  <TableHead className="w-[200px]">REVENUE ACCOUNT</TableHead>
                  <TableHead className="w-[120px] text-right">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedCategories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <Folder size={48} className="mb-4 text-muted-foreground/50" />
                        <p>No categories found</p>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingCategory(null);
                            setFormOpen(true);
                          }}
                          className="mt-4"
                        >
                          Create first category
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedCategories.map((category) => (
                    <TableRow key={category.id} className="group bg-muted/50">
                      <TableCell className="font-mono text-sm text-muted-foreground w-[150px]">
                        {category.code || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0"
                            style={{ backgroundColor: category.color || '#4A90D9' }}
                          >
                            {category.icon ? (
                              <span className="text-xs">{category.icon[0].toUpperCase()}</span>
                            ) : (
                              <Folder size={16} />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{category.name}</div>
                            {category.description && (
                              <div className="text-xs text-muted-foreground truncate max-w-xs">
                                {category.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {getParentName(category.parentId)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="font-mono">
                          {category._count?.procedures || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {category.isActive ? (
                          <Badge className="bg-success-muted text-success">
                            ACTIVE
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-muted text-muted-foreground">
                            INACTIVE
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {getRevenueAccountName(category.revenueAccountId)}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions>
                          <ActionButton
                            tone="edit"
                            label="Edit"
                            onClick={() => {
                              setEditingCategory(category);
                              setFormOpen(true);
                            }}
                          />
                          <ActionButton tone="delete" label="Delete" onClick={() => handleDelete(category)} />
                        </RowActions>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Footer with count */}
      <div className="bg-white border-t px-6 py-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows</span>
            <span className="px-2 py-1 bg-muted rounded-md font-medium">
              {filteredAndSortedCategories.length}
            </span>
          </div>
          <div>
            Showing {filteredAndSortedCategories.length} of {categories.length} categories
          </div>
        </div>
      </div>

      <CategoryForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingCategory(null);
        }}
        onSave={handleSave}
        initialData={editingCategory}
        parentOptions={categories}
      />
    </div>
  );
}