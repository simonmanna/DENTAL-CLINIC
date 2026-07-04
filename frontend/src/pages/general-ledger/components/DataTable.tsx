import { useMemo, useState, useEffect, type ReactNode } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GL } from './theme';

type SortDir = 'asc' | 'desc';
type Accessor<T> = (row: T) => string | number | null | undefined;

export interface DataTableColumn<T> {
  key: string;
  header: string;
  accessor?: Accessor<T>;
  cell?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  searchable?: boolean;
  width?: string;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  initialSort?: { key: string; dir: SortDir };
  isLoading?: boolean;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  footer?: ReactNode;
  dense?: boolean;
  toolbar?: ReactNode;
}

const alignClass = (a?: 'left' | 'right' | 'center') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

function compare(a: unknown, b: unknown): number {
  const an = typeof a === 'number' ? a : Number(a);
  const bn = typeof b === 'number' ? b : Number(b);
  const bothNumeric =
    a !== '' && b !== '' && Number.isFinite(an) && Number.isFinite(bn);
  if (bothNumeric) return an - bn;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  searchable = true,
  searchPlaceholder = 'Search…',
  pageSize,
  initialSort,
  isLoading,
  emptyText = 'No records found.',
  onRowClick,
  rowClassName,
  footer,
  dense,
  toolbar,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(
    initialSort ?? null,
  );
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [query, data]);

  const colByKey = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.key, c])),
    [columns],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return data;
    const q = query.toLowerCase();
    const searchCols = columns.filter(
      (c) => c.accessor && c.searchable !== false,
    );
    return data.filter((row) =>
      searchCols.some((c) =>
        String(c.accessor!(row) ?? '')
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [data, query, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = colByKey[sort.key];
    if (!col?.accessor) return filtered;
    const acc = col.accessor;
    const out = [...filtered].sort((a, b) => compare(acc(a), acc(b)));
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [filtered, sort, colByKey]);

  const totalPages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const pageRows = pageSize
    ? sorted.slice((page - 1) * pageSize, page * pageSize)
    : sorted;

  const toggleSort = (col: DataTableColumn<T>) => {
    if (!col.accessor || col.sortable === false) return;
    setSort((s) =>
      s?.key === col.key
        ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key: col.key, dir: 'asc' },
    );
  };

  const cellPad = dense ? 'py-1.5' : 'py-2.5';

  return (
    <div className="space-y-3">
      {(searchable || toolbar) && (
        <div className="flex items-center gap-2">
          {searchable && (
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-8 h-9 bg-white"
              />
            </div>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-400">
              {sorted.length} {sorted.length === 1 ? 'row' : 'rows'}
            </span>
            {toolbar}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-slate-200">
              {columns.map((col) => {
                const isSorted = sort?.key === col.key;
                const canSort = col.accessor && col.sortable !== false;
                return (
                  <TableHead
                    key={col.key}
                    onClick={() => toggleSort(col)}
                    className={cn(
                      GL.tableHead,
                      alignClass(col.align),
                      col.width,
                      canSort && 'cursor-pointer select-none hover:bg-sky-100/70',
                      'h-10 whitespace-nowrap',
                      col.headerClassName,
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center gap-1',
                        col.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {col.header}
                      {canSort &&
                        (isSorted ? (
                          sort!.dir === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        ))}
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-slate-400 py-10"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && pageRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-slate-400 py-10"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              pageRows.map((row, i) => (
                <TableRow
                  key={rowKey(row, i)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'border-b border-slate-100 transition-colors',
                    onRowClick && 'cursor-pointer',
                    'hover:bg-sky-50/60',
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        cellPad,
                        'text-sm text-slate-700',
                        alignClass(col.align),
                        col.className,
                      )}
                    >
                      {col.cell
                        ? col.cell(row)
                        : String(col.accessor?.(row) ?? '')}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {footer}
          </TableBody>
        </Table>
      </div>

      {pageSize && totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
