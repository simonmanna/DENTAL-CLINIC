// src/components/pharmacy/PharmacySalesStats.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';
import { SalesStats } from '@/types/pharmacy-sales';
import { Receipt, DollarSign, TrendingUp, AlertCircle } from 'lucide-react';

interface Props {
  stats?: SalesStats;
  isLoading?: boolean;
  dateRange?: { from?: string; to?: string };
}

// ─── Gradient Stat Card (matches ExpensesPage style) ───────────────────────
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = 'blue',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color?: 'blue' | 'amber' | 'emerald' | 'slate' | 'rose';
}) {
  const colors = {
    blue: {
      bg: 'from-blue-500 to-blue-600',
      icon: 'bg-blue-400/30',
      text: 'text-blue-100',
    },
    amber: {
      bg: 'from-amber-500 to-amber-600',
      icon: 'bg-amber-400/30',
      text: 'text-amber-100',
    },
    emerald: {
      bg: 'from-emerald-500 to-emerald-600',
      icon: 'bg-emerald-400/30',
      text: 'text-emerald-100',
    },
    slate: {
      bg: 'from-slate-600 to-slate-700',
      icon: 'bg-slate-500/30',
      text: 'text-slate-200',
    },
    rose: {
      bg: 'from-rose-500 to-rose-600',
      icon: 'bg-rose-400/30',
      text: 'text-rose-100',
    },
  }[color];

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${colors.bg} py-1 px-5 text-white shadow-lg`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p
            className={`text-xs font-medium uppercase tracking-widest ${colors.text} mb-0`}
          >
            {label}
          </p>
          <p className="text-xl font-bold leading-tight">{value}</p>
          {sub && <p className={`text-xs mt-0 ${colors.text}`}>{sub}</p>}
        </div>
        <div
          className={`w-11 h-11 ${colors.icon} rounded-xl flex items-center justify-center backdrop-blur-sm`}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/5" />
    </div>
  );
}

export function PharmacySalesStats({ stats, isLoading, dateRange }: Props) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-20 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const collectedPercent =
    stats.totalSales > 0 && stats.totalRevenue > 0
      ? Math.round((stats.totalCollected / stats.totalRevenue) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Summary Cards — Expenses-style gradient cards */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Sales"
          value={stats.totalSales.toString()}
          sub="transactions"
          icon={Receipt}
          color="blue"
        />
        <StatCard
          label="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          sub="gross sales"
          icon={DollarSign}
          color="slate"
        />
        <StatCard
          label="Collected"
          value={formatCurrency(stats.totalCollected)}
          sub={`${collectedPercent}% collection rate`}
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(stats.totalOutstanding)}
          sub="pending payments"
          icon={AlertCircle}
          color={stats.totalOutstanding > 0 ? 'amber' : 'slate'}
        />
      </div>

      {/* Payment Methods Breakdown */}
      {Object.keys(stats.byPaymentMethod).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byPaymentMethod).map(([method, amount]) => (
                <Badge
                  key={method}
                  variant="secondary"
                  className="px-3 py-1"
                >
                  <span className="font-medium capitalize">
                    {method.toLowerCase()}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {formatCurrency(amount)}
                  </span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Date Range Indicator */}
      {(dateRange?.from || dateRange?.to) && (
        <p className="text-xs text-muted-foreground text-center">
          Showing stats for:{' '}
          <span className="font-medium">
            {dateRange.from
              ? new Date(dateRange.from).toLocaleDateString()
              : 'start'}
            {' – '}
            {dateRange.to
              ? new Date(dateRange.to).toLocaleDateString()
              : 'now'}
          </span>
        </p>
      )}
    </div>
  );
}