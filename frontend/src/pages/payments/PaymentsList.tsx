"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Payment, PaymentFilters } from "@/types/payment";
import { paymentsApi } from "@/lib/api/payments";
import { PaymentFilters as PaymentFiltersComponent } from "./components/payment-filters";
import { PaymentDetailsDialog } from "./components/payment-details-dialog";
import { PaymentStatusBadge } from "./components/payment-status-badge";
import { PaymentMethodBadge } from "./components/payment-method-badge";
import {
  Eye,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Wallet,
  TrendingUp,
  TrendingDown,
  Receipt,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/* ═════════════════════════════════════════════════════════════════
   STYLES  (same design system as PurchasesPage)
   ═════════════════════════════════════════════════════════════════ */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  .pur-root {
    font-family: 'Plus Jakarta Sans', sans-serif;
    --clr-bg:        #f0f4ff;
    --clr-surface:   #ffffff;
    --clr-primary:   #2563eb;
    --clr-primary-d: #1d4ed8;
    --clr-primary-l: #eff6ff;
    --clr-accent:    #06b6d4;
    --clr-success:   #10b981;
    --clr-danger:    #ef4444;
    --clr-warning:   #f59e0b;
    --clr-text:      #0f172a;
    --clr-muted:     #64748b;
    --clr-border:    #e2e8f0;
    --clr-row-hover: #f8faff;
    --radius:        4px;
    --shadow-sm:     0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
    --shadow-md:     0 4px 16px rgba(37,99,235,.10), 0 1px 4px rgba(0,0,0,.06);
    --shadow-lg:     0 20px 60px rgba(37,99,235,.15), 0 8px 24px rgba(0,0,0,.08);
    min-height: 100vh;
    padding: 8px 4px;
    background: var(--clr-bg);
  }

  /* Header */
  .pur-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pur-header-left h1 {
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--clr-text);
    letter-spacing: -.5px;
    line-height: 1;
  }
  .pur-header-left p {
    margin-top: 4px;
    font-size: .875rem;
    color: var(--clr-muted);
  }
  .pur-header-left h1 span { color: var(--clr-primary); }

  /* Stats */
  .pur-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 10px;
  }
  @media (max-width: 900px) { .pur-stats { grid-template-columns: repeat(2,1fr); } }
  .pur-stat {
    background: var(--clr-surface);
    border-radius: var(--radius);
    padding: 10px;
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--clr-border);
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;
    overflow: hidden;
    transition: transform .18s, box-shadow .18s;
  }
  .pur-stat:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
  .pur-stat::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    border-radius: 12px 12px 0 0;
  }
  .pur-stat.blue::before   { background: linear-gradient(90deg, #2563eb, #06b6d4); }
  .pur-stat.green::before  { background: linear-gradient(90deg, #10b981, #34d399); }
  .pur-stat.amber::before  { background: linear-gradient(90deg, #f59e0b, #fcd34d); }
  .pur-stat.purple::before { background: linear-gradient(90deg, #7c3aed, #a78bfa); }
  .pur-stat-icon {
    width: 48px; height: 48px;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .pur-stat.blue   .pur-stat-icon { background: #eff6ff; color: #2563eb; }
  .pur-stat.green  .pur-stat-icon { background: #ecfdf5; color: #10b981; }
  .pur-stat.amber  .pur-stat-icon { background: #fffbeb; color: #f59e0b; }
  .pur-stat.purple .pur-stat-icon { background: #f5f3ff; color: #7c3aed; }
  .pur-stat-body { flex: 1; }
  .pur-stat-label { font-size: .75rem; font-weight: 600; color: var(--clr-muted); text-transform: uppercase; letter-spacing: .5px; }
  .pur-stat-value { font-size: 1.75rem; font-weight: 800; color: var(--clr-text); line-height: 1.1; margin-top: 2px; }
  .pur-stat-sub   { font-size: .75rem; color: var(--clr-muted); margin-top: 2px; }

  /* Card / table wrapper */
  .pur-card {
    background: var(--clr-surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--clr-border);
    overflow: hidden;
  }

  /* Toolbar */
  .pur-toolbar {
    padding: 6px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--clr-border);
    flex-wrap: wrap;
    background: #fafbff;
  }
  .pur-search-wrap {
    position: relative;
    flex: 1;
    min-width: 200px;
    max-width: 340px;
  }
  .pur-search-wrap svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--clr-muted); pointer-events: none; }
  .pur-search-wrap input {
    width: 100%;
    padding: 9px 14px 9px 38px;
    border: 1.5px solid var(--clr-border);
    border-radius: 8px;
    font-size: .875rem;
    font-family: inherit;
    color: var(--clr-text);
    background: white;
    outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .pur-search-wrap input:focus { border-color: var(--clr-primary); box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
  .pur-search-wrap input::placeholder { color: #94a3b8; }

  .pur-select {
    padding: 9px 32px 9px 12px;
    border: 1.5px solid var(--clr-border);
    border-radius: 8px;
    font-size: .875rem;
    font-family: inherit;
    color: var(--clr-text);
    background: white url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 10px center;
    appearance: none;
    outline: none;
    cursor: pointer;
    transition: border-color .15s;
  }
  .pur-select:focus { border-color: var(--clr-primary); box-shadow: 0 0 0 3px rgba(37,99,235,.12); }

  .pur-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 9px 18px;
    border-radius: 8px;
    font-size: .875rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    border: none;
    transition: all .15s;
    white-space: nowrap;
  }
  .pur-btn-primary {
    background: var(--clr-primary);
    color: white;
    box-shadow: 0 2px 8px rgba(37,99,235,.30);
  }
  .pur-btn-primary:hover { background: var(--clr-primary-d); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(37,99,235,.35); }
  .pur-btn-outline {
    background: white;
    color: var(--clr-text);
    border: 1.5px solid var(--clr-border);
  }
  .pur-btn-outline:hover { border-color: var(--clr-primary); color: var(--clr-primary); background: var(--clr-primary-l); }
  .pur-btn-sm { padding: 6px 12px; font-size: .8rem; }
  .pur-btn-icon { padding: 7px; border-radius: 7px; }

  .pur-toolbar-right { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .pur-count-badge {
    background: var(--clr-primary-l);
    color: var(--clr-primary);
    font-size: .75rem;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 99px;
    border: 1px solid #bfdbfe;
  }

  /* Data table */
  .pur-table-wrap { overflow-x: auto; }
  .pur-table {
    width: 100%;
    border-collapse: collapse;
    font-size: .875rem;
  }
  .pur-table thead tr {
    background: #f8faff;
    border-bottom: 2px solid var(--clr-border);
  }
  .pur-table thead th {
    padding: 11px 16px;
    text-align: left;
    font-size: .7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .7px;
    color: var(--clr-muted);
    white-space: nowrap;
    cursor: default;
    user-select: none;
  }
  .pur-table tbody tr {
    border-bottom: 1px solid #f1f5f9;
    transition: background .12s;
    cursor: pointer;
  }
  .pur-table tbody tr:last-child { border-bottom: none; }
  .pur-table tbody tr:hover { background: var(--clr-row-hover); }
  .pur-table tbody tr:hover .pur-row-actions { opacity: 1; }
  .pur-table td { padding: 12px 16px; vertical-align: middle; }

  /* Badges */
  .pur-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 6px;
    font-size: .72rem;
    font-weight: 700;
    white-space: nowrap;
  }

  /* Row actions */
  .pur-row-actions { opacity: 1; display: flex; gap: 4px; transition: opacity .15s; }
  .pur-action-btn {
    width: 30px; height: 30px;
    border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    border: none;
    transition: all .12s;
    flex-shrink: 0;
  }
  .pur-action-btn.view  { background: var(--clr-primary-l); color: var(--clr-primary); }
  .pur-action-btn.view:hover  { background: var(--clr-primary); color: white; }

  /* Pagination */
  .pur-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-top: 1px solid var(--clr-border);
    background: #fafbff;
    flex-wrap: wrap;
    gap: 12px;
  }
  .pur-pager-info { font-size: .82rem; color: var(--clr-muted); }
  .pur-pager-info strong { color: var(--clr-text); }
  .pur-pager-btns { display: flex; gap: 4px; }
  .pur-page-btn {
    min-width: 34px; height: 34px;
    padding: 0 6px;
    border-radius: 7px;
    border: 1.5px solid var(--clr-border);
    background: white;
    color: var(--clr-text);
    font-size: .82rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all .12s;
  }
  .pur-page-btn:hover:not(:disabled) { border-color: var(--clr-primary); color: var(--clr-primary); background: var(--clr-primary-l); }
  .pur-page-btn.active { background: var(--clr-primary); color: white; border-color: var(--clr-primary); }
  .pur-page-btn:disabled { opacity: .4; cursor: default; }

  /* Empty state */
  .pur-empty {
    padding: 64px 24px;
    text-align: center;
  }
  .pur-empty .icon-ring {
    width: 72px; height: 72px;
    background: var(--clr-primary-l);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 16px;
    color: var(--clr-primary);
  }
  .pur-empty h3 { font-size: 1rem; font-weight: 700; color: var(--clr-text); }
  .pur-empty p  { font-size: .875rem; color: var(--clr-muted); margin-top: 4px; }

  /* Loading */
  .pur-loading {
    padding: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--clr-muted);
    font-size: .875rem;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .pur-spinner {
    width: 22px; height: 22px;
    border: 2.5px solid var(--clr-border);
    border-top-color: var(--clr-primary);
    border-radius: 50%;
    animation: spin .7s linear infinite;
  }

  /* Misc */
  .pur-mono { font-family: 'JetBrains Mono', monospace; }
  .pur-text-right { text-align: right; }
  .pur-text-center { text-align: center; }
`;

/* ═════════════════════════════════════════════════════════════════
   HELPERS
   ═════════════════════════════════════════════════════════════════ */

const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-UG", { style: "currency", currency }).format(
    amount,
  );

/* ─── Paginator ─────────────────────────────────────────────────── */
function PaymentPaginator({
  page,
  totalPages,
  total,
  limit,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onChange: (p: number) => void;
}) {
  const from = Math.min((page - 1) * limit + 1, total);
  const to = Math.min(page * limit, total);

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (
      let i = Math.max(2, page - 1);
      i <= Math.min(totalPages - 1, page + 1);
      i++
    )
      pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="pur-pager">
      <div className="pur-pager-info">
        Showing{" "}
        <strong>
          {from}–{to}
        </strong>{" "}
        of <strong>{total}</strong> payments
      </div>
      <div className="pur-pager-btns">
        <button
          className="pur-page-btn"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span
              key={i}
              className="pur-page-btn"
              style={{ border: "none", cursor: "default" }}
            >
              …
            </span>
          ) : (
            <button
              key={i}
              className={`pur-page-btn${page === p ? " active" : ""}`}
              onClick={() => onChange(p as number)}
            >
              {p}
            </button>
          ),
        )}
        <button
          className="pur-page-btn"
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

interface PaymentsResponse {
  data: Payment[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/* ═════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═════════════════════════════════════════════════════════════════ */
export default function PaymentsPage() {
  const [filters, setFilters] = useState<PaymentFilters>({
    page: 1,
    limit: 20,
  });
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { data, isLoading } = useQuery<PaymentsResponse>({
    queryKey: ["payments", filters],
    queryFn: () => paymentsApi.getAll(filters) as Promise<PaymentsResponse>,
  });

  const payments: Payment[] = data?.data || [];
  const meta = data?.meta;

  // const { data, isLoading } = useQuery({
  //   queryKey: ['payments', filters],
  //   queryFn: () => paymentsApi.getAll(filters),
  // });

  // const payments: Payment[] = data?.data || [];
  // const meta = data?.meta;

  const openDetails = (payment: Payment) => {
    setSelectedPayment(payment);
    setDetailsOpen(true);
  };

  // Calculate stats from payments data
  const totalPayments = meta?.total || 0;
  const totalOut = payments
    .filter((p) => p.direction === "OUT")
    .reduce((sum, p) => {
    const cleaned = String(p.amount).replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
  const netBalance = totalOut;

  return (
    <div className="pur-root">
      <style>{STYLES}</style>

      {/* Header */}
      <div className="pur-header">
        <div className="pur-header-left">
          <h1>
            <span>Payments</span>
          </h1>
          <p>Manage and track all financial transactions</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="pur-btn pur-btn-outline"
            onClick={() => setFilters((f) => ({ ...f, page: 1 }))}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="pur-stats">
        <div className="pur-stat blue">
          <div className="pur-stat-icon">
            <Receipt size={22} />
          </div>
          <div className="pur-stat-body">
            <div className="pur-stat-label">Total Payments</div>
            <div className="pur-stat-value">{totalPayments}</div>
            <div className="pur-stat-sub">All transactions</div>
          </div>
        </div>

        <div className="pur-stat amber">
          <div className="pur-stat-icon">
            <TrendingDown size={22} />
          </div>
          <div className="pur-stat-body">
            <div className="pur-stat-label">Money Out</div>
            <div className="pur-stat-value" style={{ fontSize: "1.25rem" }}>
              {formatMoney(totalOut, "UGX")}
            </div>
            <div className="pur-stat-sub">Outgoing payments</div>
          </div>
        </div>

        <div className="pur-stat purple">
          <div className="pur-stat-icon">
            <Wallet size={22} />
          </div>
          <div className="pur-stat-body">
            <div className="pur-stat-label">Net Balance</div>
            <div
              className="pur-stat-value"
              style={{
                fontSize: "1.25rem",
                color: netBalance >= 0 ? "#059669" : "#dc2626",
              }}
            >
              {formatMoney(netBalance, "UGX")}
            </div>
            <div className="pur-stat-sub">Current period</div>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="pur-card" style={{ marginBottom: 1 }}>
        <div className="pur-toolbar">
          <PaymentFiltersComponent filters={filters} onChange={setFilters} />
          <div className="pur-toolbar-right">
            {meta?.total !== undefined && (
              <span className="pur-count-badge">{meta.total} payments</span>
            )}
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="pur-card">
        {/* Table */}
        {isLoading ? (
          <div className="pur-loading">
            <div className="pur-spinner" /> Loading payments…
          </div>
        ) : payments.length === 0 ? (
          <div className="pur-empty">
            <div className="icon-ring">
              <CreditCard size={28} />
            </div>
            <h3>No payments found</h3>
            <p>Try adjusting your filters or create a new payment.</p>
          </div>
        ) : (
          <>
            <div className="pur-table-wrap">
              <table className="pur-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Direction</th>
                    <th>Type</th>
                    <th className="pur-text-right">Amount</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Paid At</th>
                    <th className="pur-text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} onClick={() => openDetails(payment)}>
                      <td>
                        <div
                          className="pur-mono"
                          style={{ fontWeight: 700, color: "#2563eb" }}
                        >
                          {payment.paymentCode}
                        </div>
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          {payment.direction === "IN" ? (
                            <ArrowDownLeft size={16} color="#059669" />
                          ) : (
                            <ArrowUpRight size={16} color="#dc2626" />
                          )}
                          <span
                            style={{ fontSize: ".875rem", fontWeight: 500 }}
                          >
                            {payment.direction === "IN" ? "In" : "Out"}
                          </span>
                        </div>
                      </td>
                      <td
                        style={{
                          fontSize: ".875rem",
                          color: "var(--clr-muted)",
                        }}
                      >
                        {payment.type.replace(/_/g, " ")}
                      </td>
                      <td
                        className="pur-text-right pur-mono"
                        style={{
                          fontWeight: 700,
                          color:
                            payment.direction === "IN" ? "#059669" : "#dc2626",
                        }}
                      >
                        {formatMoney(payment.amount, payment.currency)}
                      </td>
                      <td>
                        <PaymentMethodBadge method={payment.method} />
                      </td>
                      <td>
                        <PaymentStatusBadge status={payment.status} />
                      </td>
                      <td
                        style={{
                          fontSize: ".875rem",
                          color: "var(--clr-muted)",
                        }}
                      >
                        {payment.invoice?.invoiceNumber ||
                          payment.purchaseOrder?.poNumber ||
                          payment.expense?.expenseCode ||
                          "—"}
                      </td>
                      <td
                        style={{
                          fontSize: ".82rem",
                          color: "var(--clr-muted)",
                        }}
                      >
                        {new Date(payment.paidAt).toLocaleDateString()}
                      </td>
                      <td
                        className="pur-text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="pur-row-actions">
                          <button
                            className="pur-action-btn view"
                            title="View Details"
                            onClick={() => openDetails(payment)}
                          >
                            <Eye size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {meta && meta.totalPages > 1 && (
              <PaymentPaginator
                page={meta.page || 1}
                totalPages={meta.totalPages}
                total={meta.total || 0}
                limit={filters.limit || 20}
                onChange={(p) => setFilters((f) => ({ ...f, page: p }))}
              />
            )}
          </>
        )}
      </div>

      <PaymentDetailsDialog
        payment={selectedPayment}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </div>
  );
}
