import type { ReactNode } from 'react';
import {
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { GL_HEADER } from './theme';

/**
 * A DialogContent with a full-bleed coloured header (#0369a1).
 * `[&>button]` recolours the built-in close (X) so it stays visible on the bar.
 * Use a real DialogTitle for accessibility (radix warns otherwise).
 */
export function GLDialogContent({
  title,
  subtitle,
  icon,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <DialogContent
      className={cn(
        'p-0 gap-0 overflow-hidden border-none',
        '[&>button]:text-white [&>button]:opacity-80 hover:[&>button]:opacity-100 [&>button]:top-5',
        className,
      )}
    >
      <div
        className="px-6 py-4 flex items-center gap-3 text-white"
        style={{ backgroundColor: GL_HEADER }}
      >
        {icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <DialogTitle className="text-white text-lg font-semibold leading-tight">
            {title}
          </DialogTitle>
          {subtitle && (
            <DialogDescription className="text-sky-100 text-sm">
              {subtitle}
            </DialogDescription>
          )}
        </div>
      </div>

      <div className="px-6 py-5">{children}</div>
    </DialogContent>
  );
}

/** A small section heading used inside dialogs / cards. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#0369a1] mb-2">
      {children}
    </h4>
  );
}
