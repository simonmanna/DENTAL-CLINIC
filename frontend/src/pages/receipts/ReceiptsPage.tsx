import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { receiptsApi, Receipt, ReceiptStats } from "@/lib/api/receipts";
import { formatCurrency, formatDate } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

// Icons
import {
  Receipt as ReceiptIcon,
  Search,
  Printer,
  Eye,
  Calendar,
  DollarSign,
  User,
  CheckCircle,
  ChevronLeft,
  TrendingUp,
  RefreshCw,
  MoreHorizontal,
  Loader2,
  Download,
  Ban,
  AlertTriangle,
  X,
  Filter,
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
  .pur-badge-cash       { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
  .pur-badge-mtn        { background: #fef9c3; color: #854d0e; border: 1px solid #fde047; }
  .pur-badge-airtel     { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
  .pur-badge-visa       { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
  .pur-badge-mastercard { background: #ffedd5; color: #9a3412; border: 1px solid #fdba74; }
  .pur-badge-bank       { background: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe; }
  .pur-badge-insurance  { background: #fce7f3; color: #9d174d; border: 1px solid #fbcfe8; }
  .pur-badge-cheque     { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

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
  .pur-action-btn.print { background: #f0fdf4; color: #16a34a; }
  .pur-action-btn.print:hover { background: #16a34a; color: white; }
  .pur-action-btn.void  { background: #fff1f2; color: #dc2626; }
  .pur-action-btn.void:hover  { background: #dc2626; color: white; }

  /* Status badges */
  .pur-badge-active { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
  .pur-badge-void   { background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; text-decoration: line-through; }

  /* Void dialog overlay */
  .void-overlay {
    position: fixed; inset: 0;
    background: rgba(15,23,42,.45);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
    padding: 16px;
  }
  .void-dialog {
    background: white;
    border-radius: 12px;
    box-shadow: 0 24px 64px rgba(0,0,0,.18);
    width: 100%;
    max-width: 460px;
    padding: 28px;
    animation: vdIn .18s ease;
  }
  @keyframes vdIn { from { opacity:0; transform:scale(.95); } to { opacity:1; transform:scale(1); } }
  .void-dialog h3 { margin: 0 0 4px; font-size: 1.1rem; font-weight: 800; color: #0f172a; }
  .void-dialog p  { margin: 0 0 20px; font-size: .875rem; color: #64748b; }
  .void-dialog textarea {
    width: 100%; box-sizing: border-box;
    padding: 10px 12px;
    border: 1.5px solid #e2e8f0; border-radius: 8px;
    font-size: .875rem; font-family: inherit;
    resize: vertical; min-height: 80px;
    outline: none; transition: border-color .15s;
  }
  .void-dialog textarea:focus { border-color: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,.12); }
  .void-dialog .actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
  .void-btn-cancel {
    padding: 9px 18px; border-radius: 8px;
    border: 1.5px solid #e2e8f0; background: white; cursor: pointer;
    font-size: .875rem; font-weight: 600; font-family: inherit;
    color: #64748b; transition: all .15s;
  }
  .void-btn-cancel:hover { border-color: #94a3b8; color: #334155; }
  .void-btn-confirm {
    padding: 9px 18px; border-radius: 8px;
    border: none; background: #dc2626; color: white; cursor: pointer;
    font-size: .875rem; font-weight: 700; font-family: inherit;
    display: flex; align-items: center; gap: 6px;
    transition: all .15s;
  }
  .void-btn-confirm:hover:not(:disabled) { background: #b91c1c; }
  .void-btn-confirm:disabled { opacity: .6; cursor: not-allowed; }

  /* Voided receipt row */
  .pur-table tbody tr.voided { opacity: .55; background: #fafafa; }
  .pur-table tbody tr.voided:hover { background: #f4f4f5; }

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

  /* ── Receipt Detail View ── */
  .pur-detail-root { padding: 24px; max-width: 960px; margin: 0 auto; }
  .pur-detail-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
  }
  .pur-detail-doc {
    background: white;
    border-radius: 12px;
    border: 2px dashed var(--clr-border);
    padding: 40px;
    box-shadow: var(--shadow-sm);
  }
  .pur-detail-doc .rd-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    border-bottom: 2px solid #1e293b;
    padding-bottom: 18px;
    margin-bottom: 24px;
    gap: 20px;
  }
  .pur-detail-doc .rd-brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .pur-detail-doc .rd-brand-icon {
    width: 48px;
    height: 48px;
    background: #eff6ff;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .pur-detail-doc .rd-brand-text h1 {
    font-size: 1.35rem;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
    line-height: 1.2;
  }
  .pur-detail-doc .rd-brand-text .rd-tagline {
    font-size: .72rem;
    font-weight: 700;
    color: #2563eb;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 2px 0 0;
  }
  .pur-detail-doc .rd-brand-text .rd-slogan {
    font-size: .75rem;
    color: #94a3b8;
    margin: 1px 0 0;
  }
  .pur-detail-doc .rd-meta {
    text-align: right;
    flex-shrink: 0;
  }
  .pur-detail-doc .rd-meta h2 {
    font-size: 1.1rem;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
    letter-spacing: -.3px;
  }
  .pur-detail-doc .rd-meta p {
    margin: 2px 0;
    font-size: .78rem;
    color: #64748b;
  }
  .pur-detail-doc .rd-meta .rd-receipt-label {
    font-size: .65rem;
    font-weight: 700;
    color: #2563eb;
    text-transform: uppercase;
    letter-spacing: .8px;
    margin-bottom: 4px;
  }
  .pur-detail-doc .rd-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px dashed #e2e8f0;
  }
  .pur-detail-doc .rd-title-row h2 {
    font-size: 1.15rem;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
    letter-spacing: .3px;
    text-transform: uppercase;
  }
  .pur-detail-doc .rd-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 24px;
  }
  @media (max-width: 600px) { .pur-detail-doc .rd-grid { grid-template-columns: 1fr; } }
  .pur-detail-doc .rd-block {
    border-radius: 8px;
    padding: 16px 18px;
  }
  .pur-detail-doc .rd-block-light {
    background: #f8fafc;
  }
  .pur-detail-doc .rd-block-green {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
  }
  .pur-detail-doc .rd-block-label {
    font-size: .65rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: .7px;
    margin-bottom: 8px;
  }
  .pur-detail-doc .rd-patient-name {
    font-size: 1rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
  }
  .pur-detail-doc .rd-patient-detail {
    font-size: .82rem;
    color: #64748b;
    margin: 2px 0;
  }
  .pur-detail-doc .rd-invoice-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    font-size: .85rem;
  }
  .pur-detail-doc .rd-invoice-row .rd-lbl {
    color: #64748b;
  }
  .pur-detail-doc .rd-invoice-row .rd-val {
    font-weight: 600;
    color: #0f172a;
  }
  .pur-detail-doc .rd-invoice-row .rd-val-lg {
    font-size: 1.1rem;
    font-weight: 800;
    color: #059669;
  }
  .pur-detail-doc .rd-items-table {
    width: 100%;
    border-collapse: collapse;
    font-size: .82rem;
    margin-bottom: 24px;
  }
  .pur-detail-doc .rd-items-table thead th {
    background: #f8fafc;
    padding: 10px 12px;
    text-align: left;
    font-size: .65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .6px;
    color: #64748b;
    border-bottom: 2px solid #e2e8f0;
  }
  .pur-detail-doc .rd-items-table thead th:last-child { text-align: right; }
  .pur-detail-doc .rd-items-table thead th:nth-child(3),
  .pur-detail-doc .rd-items-table thead th:nth-child(4) { text-align: center; }
  .pur-detail-doc .rd-items-table tbody td {
    padding: 10px 12px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
  }
  .pur-detail-doc .rd-items-table tbody td:last-child {
    text-align: right;
    font-weight: 600;
  }
  .pur-detail-doc .rd-items-table tbody td:nth-child(3),
  .pur-detail-doc .rd-items-table tbody td:nth-child(4) {
    text-align: center;
  }
  .pur-detail-doc .rd-totals {
    margin-bottom: 24px;
    padding: 16px 20px;
    background: #f8fafc;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }
  .pur-detail-doc .rd-totals .rd-total-row {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
    font-size: .85rem;
  }
  .pur-detail-doc .rd-totals .rd-total-row .rd-lbl { color: #64748b; }
  .pur-detail-doc .rd-totals .rd-total-row .rd-val { font-weight: 600; color: #0f172a; }
  .pur-detail-doc .rd-totals .rd-total-row.rd-divider {
    border-top: 1.5px solid #cbd5e1;
    padding-top: 8px;
    margin-top: 4px;
  }
  .pur-detail-doc .rd-totals .rd-total-row.rd-total-final .rd-lbl,
  .pur-detail-doc .rd-totals .rd-total-row.rd-total-final .rd-val {
    font-size: 1.05rem;
    font-weight: 800;
    color: #0f172a;
  }
  .pur-detail-doc .rd-totals .rd-total-row.rd-green .rd-lbl,
  .pur-detail-doc .rd-totals .rd-total-row.rd-green .rd-val {
    color: #059669;
  }
  .pur-detail-doc .rd-totals .rd-total-row.rd-amber .rd-lbl,
  .pur-detail-doc .rd-totals .rd-total-row.rd-amber .rd-val {
    color: #d97706;
  }
  .pur-detail-doc .rd-payment-section {
    margin-bottom: 24px;
  }
  .pur-detail-doc .rd-payment-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    border-radius: 8px;
    gap: 16px;
  }
  .pur-detail-doc .rd-payment-info .rd-pay-amount {
    font-size: 1.6rem;
    font-weight: 800;
    color: #059669;
    margin: 0;
  }
  .pur-detail-doc .rd-payment-info .rd-pay-details {
    text-align: right;
    font-size: .82rem;
    color: #065f46;
  }
  .pur-detail-doc .rd-payment-info .rd-pay-details p { margin: 2px 0; }
  .pur-detail-doc .rd-history-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #f8fafc;
    border-radius: 8px;
    margin-bottom: 6px;
    gap: 12px;
  }
  .pur-detail-doc .rd-section-title {
    font-size: .82rem;
    font-weight: 700;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: .5px;
    margin: 0 0 10px;
  }
  .pur-detail-doc .rd-footer {
    text-align: center;
    border-top: 1px solid #e2e8f0;
    padding-top: 18px;
    margin-top: 32px;
  }
  .pur-detail-doc .rd-footer p {
    margin: 0;
    font-size: .85rem;
    color: #64748b;
  }
  .pur-detail-doc .rd-footer .rd-footer-thanks {
    font-size: .95rem;
    font-weight: 700;
    color: #334155;
  }
  .pur-detail-doc .rd-footer .rd-footer-divider {
    width: 60px;
    height: 2px;
    background: linear-gradient(90deg, #2563eb, #06b6d4);
    margin: 10px auto;
    border-radius: 2px;
  }

  @media print {
    .pur-root { padding: 0; background: white; }
    .print-hidden { display: none !important; }
    .pur-detail-doc { border: none; box-shadow: none; padding: 0; border-radius: 0; }
    .pur-detail-doc .rd-brand-icon { background: #eff6ff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .pur-detail-doc .rd-block-light { background: #f8fafc !important; }
    .pur-detail-doc .rd-block-green { background: #ecfdf5 !important; }
    .pur-detail-doc .rd-totals { background: #f8fafc !important; }
    .pur-detail-doc .rd-payment-info { background: #ecfdf5 !important; }
    .pur-detail-doc .rd-history-item { background: #f8fafc !important; }
    .pur-detail-doc .rd-items-table thead th { background: #f8fafc !important; }
  }
`;

/* ═════════════════════════════════════════════════════════════════
   HELPERS
   ═════════════════════════════════════════════════════════════════ */

const PAYMENT_METHOD_CONFIG: Record<string, { class: string; label: string }> =
  {
    CASH: { class: "pur-badge-cash", label: "Cash" },
    MTN_MOBILE_MONEY: { class: "pur-badge-mtn", label: "MTN Mobile Money" },
    AIRTEL_MONEY: { class: "pur-badge-airtel", label: "Airtel Money" },
    VISA_CARD: { class: "pur-badge-visa", label: "Visa Card" },
    MASTERCARD: { class: "pur-badge-mastercard", label: "Mastercard" },
    BANK_TRANSFER: { class: "pur-badge-bank", label: "Bank Transfer" },
    CHEQUE: { class: "pur-badge-cheque", label: "Cheque" },
  };

/**
 * Tiny inline debounce hook — avoids a `use-debounce` dependency for a
 * 250ms keystroke delay. Returns `value` after `delay` ms of inactivity.
 */
function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Strip empty / null / undefined entries so the URL stays clean and the
 * backend's class-validator decorators only see meaningful values.
 */
function compactParams(
  obj: Record<string, string | number | undefined>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

/** Visual style for active-filter chips. Kept inline so the chips match the
 * existing badge palette without adding a new CSS class. */
const chipStyle = {
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
  borderRadius: 99,
  padding: "2px 10px",
  fontWeight: 500,
} as const;

/* ─── Paginator ─────────────────────────────────────────────────── */
function ReceiptPaginator({
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
        of <strong>{total}</strong> receipts
      </div>
      <div className="pur-pager-btns">
        <button
          className="pur-page-btn"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
        >
          ‹
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
          ›
        </button>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   VOID RECEIPT DIALOG
   ═════════════════════════════════════════════════════════════════ */
function VoidReceiptDialog({
  receipt,
  onClose,
  onVoided,
}: {
  receipt: Receipt;
  onClose: () => void;
  onVoided: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  const voidMutation = useMutation({
    mutationFn: () =>
      receiptsApi
        .voidReceipt(receipt.id, { voidReason: reason })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["receipt-stats"] });
      qc.invalidateQueries({ queryKey: ["receipt-detail", receipt.id] });
      onVoided();
    },
  });

  return (
    <div className="void-overlay" onClick={onClose}>
      <div className="void-dialog" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "#fff1f2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#dc2626",
                flexShrink: 0,
              }}
            >
              <Ban size={20} />
            </div>
            <div>
              <h3>Void Receipt</h3>
              <p style={{ margin: 0 }}>{receipt.receiptNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#94a3b8",
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <AlertTriangle
            size={16}
            style={{ color: "#ea580c", marginTop: 1, flexShrink: 0 }}
          />
          <div style={{ fontSize: ".82rem", color: "#9a3412" }}>
            <strong>This action reverses the payment.</strong> The invoice
            balance will be restored by{" "}
            <strong>{formatCurrency(receipt.amountReceived)}</strong> and cannot
            be undone.
          </div>
        </div>

        <label
          style={{
            fontSize: ".82rem",
            fontWeight: 600,
            color: "#334155",
            display: "block",
            marginBottom: 6,
          }}
        >
          Void Reason <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Enter the reason for voiding this receipt…"
          autoFocus
        />

        {voidMutation.isError && (
          <p
            style={{
              color: "#dc2626",
              fontSize: ".8rem",
              marginTop: 8,
              marginBottom: 0,
            }}
          >
            {(voidMutation.error as any)?.response?.data?.message ??
              "Failed to void receipt. Please try again."}
          </p>
        )}

        <div className="actions">
          <button
            className="void-btn-cancel"
            onClick={onClose}
            disabled={voidMutation.isPending}
          >
            Cancel
          </button>
          <button
            className="void-btn-confirm"
            onClick={() => voidMutation.mutate()}
            disabled={reason.trim().length < 3 || voidMutation.isPending}
          >
            {voidMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Ban size={14} />
            )}
            {voidMutation.isPending ? "Voiding…" : "Void Receipt"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═════════════════════════════════════════════════════════════════ */
export function ReceiptsPage() {
  const navigate = useNavigate();
  // Voiding a receipt is ADMIN_ONLY on the backend — hide the buttons for
  // everyone else instead of surfacing a 403 on click.
  const { isAdmin } = usePermissions();
  // ── Filter state ──────────────────────────────────────────────────
  // `search` is the live text input; `debouncedSearch` is what actually
  // hits the API (250 ms debounce keeps typing responsive without spamming
  // the backend). All other filters go straight through.
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);

  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "VOID">("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("");
  const [currencyFilter, setCurrencyFilter] = useState<"" | "UGX" | "USD">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");

  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">(
    "month",
  );
  const [page, setPage] = useState(1);
  const [viewReceiptId, setViewReceiptId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<Receipt | null>(null);

  // Reset to page 1 whenever a filter changes so the user doesn't land on
  // an empty page after narrowing the result set.
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    statusFilter,
    paymentMethodFilter,
    currencyFilter,
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
  ]);

  // Queries
  const { data: receiptsData, isLoading } = useQuery({
    queryKey: [
      "receipts",
      {
        search: debouncedSearch,
        statusFilter,
        paymentMethodFilter,
        currencyFilter,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
        page,
      },
    ],
    queryFn: () => {
      const params = compactParams({
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        paymentMethod: paymentMethodFilter || undefined,
        currencyCode: currencyFilter || undefined,
        startDate: dateFrom || undefined,
        endDate: dateTo || undefined,
        minAmount: minAmount ? Number(minAmount) : undefined,
        maxAmount: maxAmount ? Number(maxAmount) : undefined,
        page,
        limit: 15,
      });
      return receiptsApi.getAll(params).then((r) => r.data);
    },
    placeholderData: (previousData) => previousData,
  });

  const { data: stats } = useQuery<ReceiptStats>({
    queryKey: ["receipt-stats", period],
    queryFn: () => receiptsApi.getStats(period).then((r) => r.data),
  });

  const { data: receiptDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["receipt-detail", viewReceiptId],
    queryFn: () => receiptsApi.getForPrint(viewReceiptId!).then((r) => r.data),
    enabled: !!viewReceiptId,
  });

  const receipts = receiptsData?.data || [];
  const meta = receiptsData?.meta || {};

  // True when any non-search filter is set — drives the "Clear" button.
  const hasActiveFilters =
    !!statusFilter ||
    !!paymentMethodFilter ||
    !!currencyFilter ||
    !!dateFrom ||
    !!dateTo ||
    !!minAmount ||
    !!maxAmount;

  const clearFilters = () => {
    setStatusFilter("");
    setPaymentMethodFilter("");
    setCurrencyFilter("");
    setDateFrom("");
    setDateTo("");
    setMinAmount("");
    setMaxAmount("");
  };

  const currencyTotals = receipts.reduce(
    (acc, receipt) => {
      if (receipt.status === "VOID") return acc;

      const currency = receipt.currencyCode || "UGX";

      if (!acc[currency]) {
        acc[currency] = {
          amount: 0,
          count: 0,
        };
      }

      acc[currency].amount += Number(receipt.amountReceived || 0);
      acc[currency].count += 1;

      return acc;
    },
    {} as Record<
      string,
      {
        amount: number;
        count: number;
      }
    >,
  );

  const ugxTotal = currencyTotals.UGX?.amount || 0;
  const usdTotal = currencyTotals.USD?.amount || 0;

  // Detail view
  if (viewReceiptId && receiptDetail) {
    const detailReceipt = receiptDetail.receipt as Receipt | undefined;
    return (
      <>
        <ReceiptDetailView
          data={receiptDetail}
          onBack={() => setViewReceiptId(null)}
          onPrint={() => window.print()}
          onVoid={
            isAdmin && detailReceipt && detailReceipt.status !== "VOID"
              ? () => setVoidTarget(detailReceipt)
              : undefined
          }
        />
        {voidTarget && (
          <VoidReceiptDialog
            receipt={voidTarget}
            onClose={() => setVoidTarget(null)}
            onVoided={() => {
              setVoidTarget(null);
              setViewReceiptId(null);
            }}
          />
        )}
      </>
    );
  }

  if (viewReceiptId && detailLoading) {
    return (
      <div className="pur-root">
        <style>{STYLES}</style>
        <div className="pur-loading">
          <div className="pur-spinner" /> Loading receipt…
        </div>
      </div>
    );
  }

  return (
    <div className="pur-root">
      <style>{STYLES}</style>

      {/* Header */}
      <div className="pur-header">
        <div className="pur-header-left">
          <h1>
            <span>Receipts</span>
          </h1>
          <p>View and manage all payment receipts</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="pur-btn pur-btn-outline"
            onClick={() => navigate("/billing")}
          >
            <ChevronLeft size={14} /> Back to Billing
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="pur-stats">
        <div className="pur-stat blue">
          <div className="pur-stat-icon">
            <ReceiptIcon size={22} />
          </div>
          <div className="pur-stat-body">
            <div className="pur-stat-label">Total Receipts</div>
            <div className="pur-stat-value">{stats?.totalReceipts ?? 0}</div>
            <div className="pur-stat-sub">This {period}</div>
          </div>
        </div>

        <div className="pur-stat green">
          <div className="pur-stat-icon">
            <DollarSign size={22} />
          </div>

          <div className="pur-stat-body">
            <div className="pur-stat-label">Total Collected</div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: "1rem",
                  color: "#059669",
                }}
              >
                UGX {ugxTotal.toLocaleString()}
              </div>

              <div
                style={{
                  fontWeight: 800,
                  fontSize: "1rem",
                  color: "#2563eb",
                }}
              >
                USD {usdTotal.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="pur-stat amber">
          <div className="pur-stat-icon">
            <Calendar size={22} />
          </div>
          <div className="pur-stat-body">
            <div className="pur-stat-label">Receipts Today</div>
            <div className="pur-stat-value">{stats?.receiptsToday ?? 0}</div>
            <div className="pur-stat-sub">New today</div>
          </div>
        </div>

        <div className="pur-stat purple">
          <div className="pur-stat-icon">
            <TrendingUp size={22} />
          </div>
          <div className="pur-stat-body">
            <div className="pur-stat-label">Period</div>
            <select
              className="pur-select"
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              style={{ marginTop: 4, width: "100%" }}
            >
              <option value="day">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
          </div>
        </div>
      </div>

      {/* Void Dialog */}
      {voidTarget && (
        <VoidReceiptDialog
          receipt={voidTarget}
          onClose={() => setVoidTarget(null)}
          onVoided={() => setVoidTarget(null)}
        />
      )}

      {/* Table Card */}
      <div className="pur-card">
        {/* Toolbar */}
        <div className="pur-toolbar">
          {/* ── Search ── */}
          <div className="pur-search-wrap">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt #, invoice #, patient, payment ref…"
              aria-label="Search receipts"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--clr-muted)",
                  display: "flex",
                  alignItems: "center",
                  padding: 2,
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* ── Status ── */}
          <select
            className="pur-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            aria-label="Filter by status"
            title="Status"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="VOID">Void</option>
          </select>

          {/* ── Payment method ── */}
          <select
            className="pur-select"
            value={paymentMethodFilter}
            onChange={(e) => setPaymentMethodFilter(e.target.value)}
            aria-label="Filter by payment method"
            title="Payment method"
          >
            <option value="">All Methods</option>
            <option value="CASH">Cash</option>
            <option value="MTN_MOBILE_MONEY">MTN Mobile Money</option>
            <option value="AIRTEL_MONEY">Airtel Money</option>
            <option value="VISA_CARD">Visa Card</option>
            <option value="MASTERCARD">Mastercard</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CHEQUE">Cheque</option>
          </select>

          {/* ── Currency ── */}
          <select
            className="pur-select"
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value as any)}
            aria-label="Filter by currency"
            title="Currency"
          >
            <option value="">All Currencies</option>
            <option value="UGX">UGX</option>
            <option value="USD">USD</option>
          </select>

          {/* ── Date range (registered / generated) ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              border: "1.5px solid var(--clr-border)",
              borderRadius: 8,
              background: "white",
            }}
            title="Filter by receipt date"
          >
            <Calendar size={13} style={{ color: "var(--clr-muted)" }} />
            <input
              type="date"
              aria-label="Date from"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                fontSize: ".8rem",
                fontFamily: "inherit",
                color: "var(--clr-text)",
                background: "transparent",
                padding: "2px 0",
                width: 110,
              }}
            />
            <span style={{ color: "var(--clr-muted)", fontSize: ".75rem" }}>
              →
            </span>
            <input
              type="date"
              aria-label="Date to"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                fontSize: ".8rem",
                fontFamily: "inherit",
                color: "var(--clr-text)",
                background: "transparent",
                padding: "2px 0",
                width: 110,
              }}
            />
          </div>

          {/* ── Amount range ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              border: "1.5px solid var(--clr-border)",
              borderRadius: 8,
              background: "white",
            }}
            title="Filter by amount received"
          >
            <DollarSign size={13} style={{ color: "var(--clr-muted)" }} />
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Min"
              aria-label="Minimum amount"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                fontSize: ".8rem",
                fontFamily: "inherit",
                color: "var(--clr-text)",
                background: "transparent",
                padding: "2px 0",
                width: 80,
              }}
            />
            <span style={{ color: "var(--clr-muted)", fontSize: ".75rem" }}>
              –
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Max"
              aria-label="Maximum amount"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                fontSize: ".8rem",
                fontFamily: "inherit",
                color: "var(--clr-text)",
                background: "transparent",
                padding: "2px 0",
                width: 80,
              }}
            />
          </div>

          {/* ── Clear filters ── */}
          {hasActiveFilters && (
            <button
              type="button"
              className="pur-btn pur-btn-outline pur-btn-sm"
              onClick={clearFilters}
              title="Clear all filters"
            >
              <X size={13} /> Clear
            </button>
          )}

          <div className="pur-toolbar-right">
            {meta.total > 0 && (
              <span className="pur-count-badge">
                {meta.total.toLocaleString()} receipts
              </span>
            )}
          </div>
        </div>

        {/* ── Active filter chips ── */}
        {(debouncedSearch || hasActiveFilters) && (
          <div
            style={{
              padding: "8px 20px",
              borderBottom: "1px solid var(--clr-border)",
              background: "#f8faff",
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              alignItems: "center",
              fontSize: ".75rem",
              color: "var(--clr-muted)",
            }}
          >
            <Filter size={12} style={{ color: "var(--clr-muted)" }} />
            <span style={{ fontWeight: 600, marginRight: 4 }}>
              Active filters:
            </span>
            {debouncedSearch && (
              <span className="pur-badge" style={chipStyle}>
                search: <strong>"{debouncedSearch}"</strong>
              </span>
            )}
            {statusFilter && (
              <span className="pur-badge" style={chipStyle}>
                status: <strong>{statusFilter}</strong>
              </span>
            )}
            {paymentMethodFilter && (
              <span className="pur-badge" style={chipStyle}>
                method:{" "}
                <strong>
                  {PAYMENT_METHOD_CONFIG[paymentMethodFilter]?.label ??
                    paymentMethodFilter}
                </strong>
              </span>
            )}
            {currencyFilter && (
              <span className="pur-badge" style={chipStyle}>
                currency: <strong>{currencyFilter}</strong>
              </span>
            )}
            {(dateFrom || dateTo) && (
              <span className="pur-badge" style={chipStyle}>
                date:{" "}
                <strong>
                  {dateFrom || "…"} → {dateTo || "…"}
                </strong>
              </span>
            )}
            {(minAmount || maxAmount) && (
              <span className="pur-badge" style={chipStyle}>
                amount:{" "}
                <strong>
                  {minAmount || "0"} – {maxAmount || "∞"}
                </strong>
              </span>
            )}
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="pur-loading">
            <div className="pur-spinner" /> Loading receipts…
          </div>
        ) : receipts.length === 0 ? (
          <div className="pur-empty">
            <div className="icon-ring">
              <ReceiptIcon size={28} />
            </div>
            <h3>No receipts found</h3>
            <p>
              {debouncedSearch || hasActiveFilters
                ? `No receipts match your current filters${
                    debouncedSearch ? ` (search: "${debouncedSearch}")` : ""
                  }.`
                : "Receipts will appear after payments are processed."}
            </p>
            {(debouncedSearch || hasActiveFilters) && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "center",
                  marginTop: 12,
                }}
              >
                {search && (
                  <button
                    type="button"
                    className="pur-btn pur-btn-outline pur-btn-sm"
                    onClick={() => setSearch("")}
                  >
                    <X size={12} /> Clear search
                  </button>
                )}
                {hasActiveFilters && (
                  <button
                    type="button"
                    className="pur-btn pur-btn-outline pur-btn-sm"
                    onClick={clearFilters}
                  >
                    <X size={12} /> Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="pur-table-wrap">
              <table className="pur-table">
                <thead>
                  <tr>
                    <th>Receipt #</th>
                    <th>Patient</th>
                    <th>Invoice #</th>
                    <th className="pur-text-right">Amount</th>
                    <th className="pur-text-center">Payment Method</th>
                    <th>Received By</th>
                    <th>Date</th>
                    <th className="pur-text-center">Status</th>
                    <th className="pur-text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((receipt: Receipt) => {
                    const methodCode =
                      receipt.payment?.method ?? receipt.paymentMethod ?? null;
                    const pm = methodCode
                      ? (PAYMENT_METHOD_CONFIG[methodCode] ?? {
                          class: "pur-badge-cheque",
                          label: methodCode.replace(/_/g, " "),
                        })
                      : null;
                    const isVoided = receipt.status === "VOID";
                    return (
                      <tr
                        key={receipt.id}
                        className={isVoided ? "voided" : ""}
                        onClick={() => setViewReceiptId(receipt.id)}
                      >
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              className="pur-mono"
                              style={{
                                fontWeight: 700,
                                color: isVoided ? "#94a3b8" : "#2563eb",
                              }}
                            >
                              {receipt.receiptNumber}
                            </span>
                            {isVoided && (
                              <span className="pur-badge pur-badge-void">
                                VOID
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>
                            {receipt.invoice.patient.firstName}{" "}
                            {receipt.invoice.patient.lastName}
                          </div>
                          <div
                            style={{
                              fontSize: ".75rem",
                              color: "var(--clr-muted)",
                            }}
                          >
                            {receipt.invoice.patient.patientCode}
                          </div>
                        </td>
                        <td
                          className="pur-mono"
                          style={{ color: "var(--clr-muted)" }}
                        >
                          {receipt.invoice.invoiceNumber}
                        </td>
                        <td
                          className="pur-text-left"
                          style={{
                            fontWeight: 700,
                            color: isVoided ? "#94a3b8" : "#059669",
                            textDecoration: isVoided ? "line-through" : "none",
                          }}
                        >
                          {formatCurrency(
                            receipt.amountReceived,
                            receipt.currencyCode,
                          )}
                        </td>
                        <td className="pur-text-left">
                          {pm ? (
                            <span className={`pur-badge ${pm.class}`}>
                              {pm.label}
                            </span>
                          ) : (
                            <span style={{ color: "var(--clr-muted)" }}>—</span>
                          )}
                        </td>
                        <td style={{ fontSize: ".82rem" }}>
                          {receipt.receivedBy ? (
                            `${receipt.receivedBy.firstName} ${receipt.receivedBy.lastName}`
                          ) : receipt.receivedByName ? (
                            receipt.receivedByName
                          ) : (
                            <span style={{ color: "var(--clr-muted)" }}>—</span>
                          )}
                        </td>
                        <td
                          style={{
                            fontSize: ".82rem",
                            color: "var(--clr-muted)",
                          }}
                        >
                          {formatDate(receipt.generatedAt)}
                        </td>
                        <td className="pur-text-center">
                          {isVoided ? (
                            <span className="pur-badge pur-badge-void">
                              Voided
                            </span>
                          ) : (
                            <span className="pur-badge pur-badge-active">
                              Active
                            </span>
                          )}
                        </td>
                        <td
                          className="pur-text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="pur-row-actions">
                            <button
                              className="pur-action-btn view"
                              title="View"
                              onClick={() => setViewReceiptId(receipt.id)}
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              className="pur-action-btn print"
                              title="Print"
                              onClick={() => {
                                setViewReceiptId(receipt.id);
                                setTimeout(() => window.print(), 100);
                              }}
                            >
                              <Printer size={13} />
                            </button>
                            {isAdmin && !isVoided && (
                              <button
                                className="pur-action-btn void"
                                title="Void Receipt"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVoidTarget(receipt);
                                }}
                              >
                                <Ban size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {meta.totalPages > 1 && (
              <ReceiptPaginator
                page={page}
                totalPages={meta.totalPages || 1}
                total={meta.total || 0}
                limit={15}
                onChange={setPage}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   RECEIPT DETAIL VIEW
   ═════════════════════════════════════════════════════════════════ */
function ReceiptDetailView({
  data,
  onBack,
  onPrint,
  onVoid,
}: {
  data: any;
  onBack: () => void;
  onPrint: () => void;
  onVoid?: () => void;
}) {
  const { clinic, receipt, invoice, patient, payments } = data;
  const isFullyPaid = invoice.balance <= 0;
  const isVoided = receipt.status === "VOID";

  return (
    <div className="pur-root">
      <style>{STYLES}</style>
      <div className="pur-detail-root">
        {/* Header Actions */}
        <div className="pur-detail-header print-hidden">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="pur-btn pur-btn-outline" onClick={onBack}>
              <ChevronLeft size={16} /> Back
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800 }}>
                {receipt.receiptNumber}
              </h1>
              <p
                style={{
                  margin: 0,
                  fontSize: ".875rem",
                  color: "var(--clr-muted)",
                }}
              >
                Generated {formatDate(receipt.generatedAt)}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {!isVoided && onVoid && (
              <button
                className="pur-btn"
                style={{
                  background: "#fff1f2",
                  color: "#dc2626",
                  border: "1.5px solid #fecaca",
                  fontWeight: 700,
                }}
                onClick={onVoid}
              >
                <Ban size={14} /> Void Receipt
              </button>
            )}
            <button className="pur-btn pur-btn-outline" onClick={onPrint}>
              <Printer size={14} /> Print
            </button>
            <button className="pur-btn pur-btn-primary">
              <Download size={14} /> Download PDF
            </button>
          </div>
        </div>

        {/* Document */}
        <div className="pur-detail-doc print-area">
          {/* Header */}
          <div className="rd-header">
            <div className="rd-brand">
              <div className="rd-brand-icon">
                <svg width="26" height="34" viewBox="0 0 60 80" fill="none">
                  <path
                    d="M30 3C17 3 6 12 6 23c0 9 3 16 7 23 4 8 5 18 7 27 1 4 4 6 7 4 2-2 2-8 3-8s1 6 3 8c3 2 6 0 7-4 2-9 3-19 7-27 4-7 7-14 7-23C54 12 43 3 30 3z"
                    fill="#2563eb"
                  />
                </svg>
              </div>
              <div className="rd-brand-text">
                <h1>{clinic?.name || "Fshikta Dental Clinic"}</h1>
                <p className="rd-tagline">Dental Clinic</p>
                <p className="rd-slogan">Healthy Smile, Healthy Life</p>
              </div>
            </div>
            <div className="rd-meta">
              <p className="rd-receipt-label">Receipt</p>
              <h2>{receipt.receiptNumber}</h2>
              <p>
                {new Date(receipt.generatedAt).toLocaleDateString("en-UG", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {/* Voided banner */}
          {isVoided && (
            <div
              style={{
                background: "#fef2f2",
                border: "1.5px solid #fecaca",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 20,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <Ban
                size={18}
                style={{ color: "#dc2626", flexShrink: 0, marginTop: 1 }}
              />
              <div>
                <p
                  style={{
                    margin: "0 0 2px",
                    fontWeight: 700,
                    color: "#dc2626",
                    fontSize: ".9rem",
                  }}
                >
                  This receipt has been VOIDED
                </p>
                {receipt.voidReason && (
                  <p
                    style={{ margin: 0, fontSize: ".82rem", color: "#7f1d1d" }}
                  >
                    Reason: {receipt.voidReason}
                  </p>
                )}
                {receipt.voidedBy && (
                  <p
                    style={{ margin: 0, fontSize: ".75rem", color: "#991b1b" }}
                  >
                    Voided by: {receipt.voidedBy}
                  </p>
                )}
                {receipt.voidedAt && (
                  <p
                    style={{ margin: 0, fontSize: ".75rem", color: "#991b1b" }}
                  >
                    On: {new Date(receipt.voidedAt).toLocaleString("en-UG")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Title row */}
          <div className="rd-title-row">
            <h2 style={{ color: isVoided ? "#94a3b8" : undefined }}>
              {isVoided ? "VOIDED RECEIPT" : "OFFICIAL RECEIPT"}
            </h2>
            {isVoided ? (
              <span className="pur-badge pur-badge-void">VOID</span>
            ) : isFullyPaid ? (
              <span className="pur-badge pur-badge-cash">
                <CheckCircle size={12} /> PAID IN FULL
              </span>
            ) : null}
          </div>

          {/* Bill To + Invoice Info */}
          <div className="rd-grid">
            <div className="rd-block rd-block-light">
              <div className="rd-block-label">Bill To</div>
              <p className="rd-patient-name">
                {patient.firstName} {patient.lastName}
              </p>
              <p className="rd-patient-detail">
                Patient ID: {patient.patientCode}
              </p>
              {patient.phone && (
                <p className="rd-patient-detail">Tel: {patient.phone}</p>
              )}
              {patient.email && (
                <p className="rd-patient-detail">{patient.email}</p>
              )}
            </div>

            <div className="rd-block rd-block-light">
              <div className="rd-block-label">Invoice</div>
              <div className="rd-invoice-row">
                <span className="rd-lbl">Invoice #</span>
                <span className="rd-val">{invoice.invoiceNumber}</span>
              </div>
              {invoice.discountAmount > 0 && (
                <div className="rd-invoice-row">
                  <span className="rd-lbl">Discount</span>
                  <span className="rd-val">
                    -{formatCurrency(invoice.discountAmount)}
                  </span>
                </div>
              )}
              {invoice.taxAmount > 0 && (
                <div className="rd-invoice-row">
                  <span className="rd-lbl">Tax ({invoice.taxPercent}%)</span>
                  <span className="rd-val">
                    {formatCurrency(invoice.taxAmount)}
                  </span>
                </div>
              )}
              <div className="rd-invoice-row">
                <span className="rd-lbl">Total</span>
                <span className="rd-val">
                  {formatCurrency(invoice.total)}
                </span>
              </div>
              <div className="rd-invoice-row">
                <span className="rd-lbl">Paid</span>
                <span className="rd-val" style={{ color: "#059669" }}>
                  {formatCurrency(invoice.amountPaid)}
                </span>
              </div>
              {invoice.balance > 0 && (
                <div className="rd-invoice-row">
                  <span className="rd-lbl">Balance</span>
                  <span className="rd-val" style={{ color: "#d97706" }}>
                    {formatCurrency(invoice.balance)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Invoice Items Table */}
          {(invoice.items ?? []).length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <p className="rd-section-title">Invoice Items</p>
              <table className="rd-items-table">
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>#</th>
                    <th>Description</th>
                    <th style={{ width: 56 }}>Qty</th>
                    <th style={{ width: 100 }}>Unit Price (UGX)</th>
                    <th style={{ width: 120 }}>Total (UGX)</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item: any, idx: number) => (
                    <tr key={item.id || idx}>
                      <td style={{ color: "#94a3b8" }}>{idx + 1}</td>
                      <td>{item.description || item.name}</td>
                      <td>{item.quantity}</td>
                      <td>{Number(item.unitPrice).toLocaleString("en-UG")}</td>
                      <td>{Number(item.total || item.quantity * item.unitPrice).toLocaleString("en-UG")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div className="rd-totals">
            <div className="rd-total-row">
              <span className="rd-lbl">Subtotal</span>
              <span className="rd-val">{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.discountAmount > 0 && (
              <div className="rd-total-row">
                <span className="rd-lbl">Discount</span>
                <span className="rd-val" style={{ color: "#059669" }}>
                  -{formatCurrency(invoice.discountAmount)}
                </span>
              </div>
            )}
            {invoice.taxAmount > 0 && (
              <div className="rd-total-row">
                <span className="rd-lbl">Tax ({invoice.taxPercent}%)</span>
                <span className="rd-val">
                  {formatCurrency(invoice.taxAmount)}
                </span>
              </div>
            )}
            <div className="rd-total-row rd-divider rd-total-final">
              <span className="rd-lbl">Total</span>
              <span className="rd-val">{formatCurrency(invoice.total)}</span>
            </div>
            <div className="rd-total-row rd-green">
              <span className="rd-lbl">Amount Paid</span>
              <span className="rd-val">
                {formatCurrency(invoice.amountPaid)}
              </span>
            </div>
            {invoice.balance > 0 && (
              <div className="rd-total-row rd-amber">
                <span className="rd-lbl">Balance Due</span>
                <span className="rd-val">
                  {formatCurrency(invoice.balance)}
                </span>
              </div>
            )}
          </div>

          {/* This Payment */}
          <div className="rd-payment-section">
            <p className="rd-section-title">This Payment</p>
            <div className="rd-payment-info">
              <div>
                <p className="rd-pay-amount">
                  {formatCurrency(receipt.amountReceived, receipt.currency)}
                </p>
                {receipt.notes && (
                  <p
                    style={{
                      fontSize: ".82rem",
                      color: "#065f46",
                      margin: "4px 0 0",
                    }}
                  >
                    {receipt.notes}
                  </p>
                )}
              </div>
              <div className="rd-pay-details">
                <p>
                  Date: {formatDate(receipt.generatedAt)}
                </p>
                {(receipt.payment?.method || receipt.paymentMethod) && (
                  <p>
                    Method:{" "}
                    {String(
                      receipt.payment?.method ?? receipt.paymentMethod,
                    ).replace(/_/g, " ")}
                  </p>
                )}
                {(receipt.receivedBy || receipt.receivedByName) && (
                  <p>
                    Received By:{" "}
                    {receipt.receivedBy
                      ? `${receipt.receivedBy.firstName} ${receipt.receivedBy.lastName}`
                      : receipt.receivedByName}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Payment History */}
          {payments?.length > 0 && (
            <div className="rd-payment-section">
              <p className="rd-section-title">Payment History</p>
              <div>
                {payments.map((payment: any) => (
                  <div key={payment.id} className="rd-history-item">
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <CheckCircle size={16} color="#10b981" />
                      <span style={{ fontWeight: 600 }}>
                        {String(payment.method).replace(/_/g, " ")}
                      </span>
                      {payment.reference && (
                        <span style={{ fontSize: ".8rem", color: "#64748b" }}>
                          Ref: {payment.reference}
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontWeight: 700, margin: 0 }}>
                        {formatCurrency(payment.amount)}
                      </p>
                      <p
                        style={{
                          fontSize: ".72rem",
                          color: "#64748b",
                          margin: "2px 0 0",
                        }}
                      >
                        {formatDate(payment.paidAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="rd-footer">
            <p className="rd-footer-thanks">
              Thank you for choosing{" "}
              {clinic?.name || "Fshikta Dental Clinic"}
            </p>
            <div className="rd-footer-divider" />
            <p>
              This is an official receipt. Please keep it for your records.
            </p>
            {clinic?.phone && (
              <p style={{ marginTop: 4 }}>
                For inquiries, contact us at {clinic.phone}
                {clinic?.email ? ` | ${clinic.email}` : ""}
              </p>
            )}
            {clinic?.licenseNo && (
              <p style={{ fontSize: ".72rem", marginTop: 4, color: "#94a3b8" }}>
                License: {clinic.licenseNo}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReceiptsPage;
