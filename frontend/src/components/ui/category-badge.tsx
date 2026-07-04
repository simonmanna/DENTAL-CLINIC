// src/components/ui/category-badge.tsx
import { cn } from '@/lib/utils';
import { InventoryCategory } from '@/types/inventory';
import { Icons, type IconName } from '@/components/ui/icons';

interface CategoryBadgeProps {
  category: Pick<InventoryCategory, 'name' | 'code' | 'color' | 'icon'>;
  variant?: 'default' | 'outline' | 'soft';
  showCode?: boolean;
  className?: string;
}

export function CategoryBadge({ 
  category, 
  variant = 'default', 
  showCode = true,
  className 
}: CategoryBadgeProps) {
  const baseStyles = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium";
  
  const variants = {
    default: `text-white ${category.color ? '' : 'bg-primary'}`,
    outline: "border border-input bg-background hover:bg-accent",
    soft: `${category.color ? 'text-white' : 'text-foreground'} ${category.color ? '' : 'bg-muted'}`,
  };

  return (
    <span 
      className={cn(baseStyles, variants[variant], className)}
      style={variant !== 'outline' && category.color ? { backgroundColor: category.color } : {}}
    >
      {category.icon && <Icons 
    name={category.icon as IconName} // 👈 Cast the string to IconName
    className="h-3 w-3" 
  />}
      {category.name}
      {showCode && category.code && (
        <span className="opacity-70 font-mono">[{category.code}]</span>
      )}
    </span>
  );
}