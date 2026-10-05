// ✅ FIX: Import React explicitly for React.Children, isValidElement, cloneElement
import React, { ReactNode, Children, isValidElement, cloneElement } from 'react';
import { cn, statusColors } from '../../lib/utils';
import { Loader2, ChevronLeft, ChevronRight, Search, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

// ─── StatCard ────────────────────────────────────────────────
interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  iconBg?: string;
  change?: string;
  changeType?: 'up' | 'down' | 'neutral';
  subtitle?: string;
}

export function StatCard({ title, value, icon, iconBg = 'bg-primary-muted', change, changeType, subtitle }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-border/60 py-1 px-12 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-sm font-bold text-foreground mt-1">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground/70 mt-1">{subtitle}</p>}
          {change && (
            <div className={cn(
              'flex items-center gap-1 mt-2 text-xs font-medium',
              changeType === 'up' ? 'text-success' : changeType === 'down' ? 'text-danger' : 'text-muted-foreground'
            )}>
              <span>{changeType === 'up' ? '↑' : changeType === 'down' ? '↓' : '•'} {change}</span>
            </div>
          )}
        </div>
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', iconBg)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── PageHeader ──────────────────────────────────────────────
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, backTo, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-1 ml-4 mt-2">
      <div className="flex items-center gap-3">
        {backTo && (
          <Link to={backTo} className="p-2 rounded-lg bg-white border border-border text-muted-foreground hover:text-foreground hover:border-input transition-all">
            <ChevronLeft className="w-4 h-4" />
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {/* {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>} */}
        </div>
      </div>
      {actions && <div className="flex items-center gap-1 pt-3">{actions}</div>}
    </div>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const color = statusColors[status] || 'bg-muted text-foreground';
  return (
    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-semibold inline-flex items-center gap-1', color)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ─── LoadingSpinner ───────────────────────────────────────────
export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center p-8', className)}>
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

// ─── EmptyState ──────────────────────────────────────────────
interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">{icon}</div>}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── SearchBar ───────────────────────────────────────────────
export function SearchBar({
  value, onChange, placeholder = 'Search...', className
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-transparent bg-white placeholder:text-muted-foreground/70"
      />
    </div>
  );
}

// ─── Button ──────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...props }: ButtonProps) {
  const variants = {
    primary: 'bg-primary hover:bg-primary text-white shadow-sm shadow-blue-200',
    secondary: 'bg-muted hover:bg-muted text-foreground',
    danger: 'bg-danger hover:bg-danger text-white',
    ghost: 'hover:bg-muted text-muted-foreground',
    outline: 'border border-border hover:border-input hover:bg-muted/50 text-foreground bg-white',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-4 py-2 text-sm rounded-lg',
    lg: 'px-6 py-2.5 text-sm rounded-xl',
  };
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center gap-2 font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed',
        variants[variant], sizes[size], className
      )}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ─── Card ────────────────────────────────────────────────────
export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <div className={cn('bg-white rounded-xl border border-border/60 shadow-sm', className)}>
      {title && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <h3 className="font-semibold text-foreground text-sm">{title}</h3>
          {action}
        </div>
      )}
      <div className={title ? '' : ''}>{children}</div>
    </div>
  );
}

// ─── Pagination ──────────────────────────────────────────────
interface PaginationProps {
  page: number; totalPages: number; onPageChange: (p: number) => void; total: number; limit: number;
}

export function Pagination({ page, totalPages, onPageChange, total, limit }: PaginationProps) {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border/60">
      <p className="text-sm text-muted-foreground">Showing {start}–{end} of {total}</p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed text-muted-foreground">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          const p = i + Math.max(1, page - 2);
          if (p > totalPages) return null;
          return (
            <button key={p} onClick={() => onPageChange(p)}
              className={cn('w-8 h-8 rounded-lg text-sm font-medium transition-colors', p === page ? 'bg-primary text-white' : 'hover:bg-muted text-muted-foreground')}>
              {p}
            </button>
          );
        })}
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
          className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed text-muted-foreground">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── FormField ───────────────────────────────────────────────
export function FormField({ label, error, required, children, hint }: {
  label: string; error?: string; required?: boolean; children: ReactNode; hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground/70">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// ─── Input ───────────────────────────────────────────────────
export function Input({ className, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      {...props}
      className={cn(
        'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-transparent bg-white placeholder:text-muted-foreground/70 text-foreground',
        error ? 'border-danger/30' : 'border-border',
        props.disabled && 'bg-muted/50 cursor-not-allowed',
        className
      )}
    />
  );
}

// ─── Select ──────────────────────────────────────────────────
export function Select({ className, children, error, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <select
      {...props}
      className={cn(
        'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-transparent bg-white text-foreground appearance-none cursor-pointer',
        error ? 'border-danger/30' : 'border-border',
        className
      )}
    >
      {children}
    </select>
  );
}

// ─── Textarea ────────────────────────────────────────────────
export function Textarea({ className, error, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-transparent bg-white placeholder:text-muted-foreground/70 text-foreground resize-none',
        error ? 'border-danger/30' : 'border-border',
        className
      )}
    />
  );
}

// ─── Modal ───────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative bg-white rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh]', width)}>
        {/* Updated header with gradient background and white text */}
        <div
          className="flex items-center justify-between px-5 py-4 rounded-t-2xl"
          style={{ background: "linear-gradient(135deg, #0369a1, #0369a1)" }}
        >
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Content area – unchanged */}
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}
// export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: {
//   open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string;
// }) {
//   if (!open) return null;
//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
//       <div className="absolute inset-0 bg-foreground/50 backdrop-blur-sm" onClick={onClose} />
//       <div className={cn('relative bg-white rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh]', width)}>
//         <div className="flex items-center justify-between p-5 border-b border-border/60">
//           <h2 className="text-lg font-semibold text-foreground">{title}</h2>
//           <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground/70 hover:text-muted-foreground transition-colors">
//             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
//           </button>
//         </div>
//         <div className="overflow-y-auto flex-1 p-5">{children}</div>
//       </div>
//     </div>
//   );
// }

// ─── Table ───────────────────────────────────────────────────
export function Table({ headers, children, className }: { headers: string[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border/60">
            {headers.map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr onClick={onClick} className={cn('hover:bg-muted/70 transition-colors', onClick && 'cursor-pointer', className)}>
      {children}
    </tr>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 text-foreground', className)}>{children}</td>;
}

// ─── Tabs ────────────────────────────────────────────────────
export function Tabs({ value, onChange, children }: { 
  value: string; 
  onChange: (val: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 border-b border-border pb-2 mb-6">
      {/* ✅ FIX: Use destructured imports instead of React.* */}
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return null;
        return cloneElement(child as React.ReactElement<any>, {
          active: (child as any).props.value === value,
          onClick: () => onChange((child as any).props.value),
        });
      })}
    </div>
  );
}

// ─── Tab ─────────────────────────────────────────────────────
export function Tab({ value, icon, children, active, onClick }: { 
  value: string; 
  icon?: React.ReactNode; 
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
        active 
          ? "bg-primary text-white" 
          : "text-muted-foreground hover:bg-muted"
      )}
    >
      {icon}
      {children}
    </button>
  );
}