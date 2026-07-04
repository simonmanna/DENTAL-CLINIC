import { CategoryList } from './components/category-list';

export function InventoryCategoriesPage() {
  return (
    <div className="container mx-auto py-0 space-y-1">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inventory Categories</h1>
        {/* <p className="text-muted-foreground">
          Manage categories for organizing your inventory items
        </p> */}
      </div>
      <CategoryList />
    </div>
  );
}