// src/pages/purchases/PurchasesPage.tsx

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  ShoppingBag,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Edit2,
  CheckCircle,
  XCircle,
  Send,
  Truck,
  CreditCard,
  MoreHorizontal,
  Package,
  Pill,
  AlertTriangle,
  CheckCircle2,
  X,
} from "lucide-react";
import {
  usePurchaseDashboard,
  usePurchaseOrders,
  useSubmitPurchaseOrder,
  useApprovePurchaseOrder,
  useCancelPurchaseOrder,
  useUpdatePurchaseOrder,
  useSuppliers,
  useLocations,
  useInventoryItems,
  useCreatePurchaseOrder,
  useCreateDelivery, // ADD THIS
} from "../../hooks/usePurchase";
import type { PurchaseOrder, UnitOfMeasure } from "../../types/purchase.types";
import { cn } from "../../lib/utils";

// Import modals
import EditPurchaseOrderModal from "./components/EditPurchaseOrderModal";
import ApprovePurchaseOrderModal from "./components/ApprovePurchaseOrderModal";
import RecordDeliveryModal from "./components/RecordDeliveryModal"; // ADD THIS
import CreatePurchaseOrderModal from "./components/CreatePurchaseOrderModal"; // ADD THIS

// ... keep all your STYLES constant exactly as before ...
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

  /* ── Header ── */
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

  /* ── Stat cards ── */
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
  .pur-stat.red::before    { background: linear-gradient(90deg, #ef4444, #f87171); }
  .pur-stat-icon {
    width: 48px; height: 48px;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .pur-stat.blue   .pur-stat-icon { background: #eff6ff; color: #2563eb; }
  .pur-stat.green  .pur-stat-icon { background: #ecfdf5; color: #10b981; }
  .pur-stat.amber  .pur-stat-icon { background: #fffbeb; color: #f59e0b; }
  .pur-stat.red    .pur-stat-icon { background: #fef2f2; color: #ef4444; }
  .pur-stat-body { flex: 1; }
  .pur-stat-label { font-size: .75rem; font-weight: 600; color: var(--clr-muted); text-transform: uppercase; letter-spacing: .5px; }
  .pur-stat-value { font-size: 1.75rem; font-weight: 800; color: var(--clr-text); line-height: 1.1; margin-top: 2px; }
  .pur-stat-sub   { font-size: .75rem; color: var(--clr-muted); margin-top: 2px; }

  /* ── Card / table wrapper ── */
  .pur-card {
    background: var(--clr-surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--clr-border);
    overflow: hidden;
  }

  /* ── Toolbar ── */
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
  .pur-btn-danger { background: #fef2f2; color: var(--clr-danger); border: 1.5px solid #fecaca; }
  .pur-btn-danger:hover { background: var(--clr-danger); color: white; }

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

  /* ── Data table ── */
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
    cursor: pointer;
    user-select: none;
    transition: color .12s;
  }
  .pur-table thead th:hover { color: var(--clr-primary); }

  .pur-table tbody tr {
    border-bottom: 1px solid #f1f5f9;
    transition: background .12s;
    cursor: pointer;
  }
  .pur-table tbody tr:last-child { border-bottom: none; }
  .pur-table tbody tr:hover { background: var(--clr-row-hover); }
  .pur-table tbody tr:hover .pur-row-actions { opacity: 1; }
  .pur-table td { padding: 12px 16px; vertical-align: middle; }

  /* ── Badges ── */
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
  .pur-badge-draft { background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb; }
  .pur-badge-submitted { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
  .pur-badge-approved { background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe; }
  .pur-badge-partial { background: #ede9fe; color: #6d28d9; border: 1px solid #ddd6fe; }
  .pur-badge-received { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
  .pur-badge-cancelled { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
  
  .pur-badge-unpaid { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
  .pur-badge-partial-paid { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
  .pur-badge-paid { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
  .pur-badge-overdue { background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa; }

  /* ── Row actions ── */
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
  .pur-action-btn.edit  { background: #f0fdf4; color: #16a34a; }
  .pur-action-btn.edit:hover  { background: #16a34a; color: white; }
  .pur-action-btn.approve { background: #eff6ff; color: #2563eb; }
  .pur-action-btn.approve:hover { background: #2563eb; color: white; }

  /* ── Pagination ── */
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

  /* ── Modal overlay ── */
  .pur-overlay {
    position: fixed; inset: 0;
    background: rgba(15,23,42,.5);
    backdrop-filter: blur(4px);
    z-index: 50;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    animation: fadeIn .15s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .pur-modal {
    background: white;
    border-radius: 16px;
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 900px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    animation: slideUp .2s ease;
  }
  .pur-modal-sm { max-width: 500px; }
  .pur-modal-lg { max-width: 1000px; }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .pur-modal-header {
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--clr-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .pur-modal-header h2 {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--clr-text);
    display: flex; align-items: center; gap: 10px;
  }
  .pur-modal-header h2 .icon-wrap {
    width: 36px; height: 36px;
    background: var(--clr-primary-l);
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    color: var(--clr-primary);
  }
  .pur-modal-close {
    width: 34px; height: 34px;
    border-radius: 8px;
    border: 1.5px solid var(--clr-border);
    background: white;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: var(--clr-muted);
    transition: all .12s;
  }
  .pur-modal-close:hover { background: #fee2f2; color: var(--clr-danger); border-color: #fecaca; }

  .pur-modal-body {
    overflow-y: auto;
    padding: 24px;
    flex: 1;
  }
  .pur-modal-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--clr-border);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    flex-shrink: 0;
    background: #fafbff;
  }

  /* ── Form sections ── */
  .pur-form-section {
    margin-bottom: 28px;
  }
  .pur-form-section:last-child { margin-bottom: 0; }
  .pur-section-label {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 2px solid var(--clr-border);
  }
  .pur-section-label .num {
    width: 22px; height: 22px;
    background: var(--clr-primary);
    color: white;
    border-radius: 6px;
    font-size: .72rem;
    font-weight: 800;
    display: flex; align-items: center; justify-content: center;
  }
  .pur-section-label span {
    font-size: .82rem;
    font-weight: 700;
    color: var(--clr-text);
    text-transform: uppercase;
    letter-spacing: .5px;
  }

  .pur-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .pur-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .pur-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  @media (max-width: 600px) { .pur-grid-2, .pur-grid-3, .pur-grid-4 { grid-template-columns: 1fr; } }

  .pur-field { display: flex; flex-direction: column; gap: 5px; }
  .pur-field label {
    font-size: .77rem;
    font-weight: 700;
    color: var(--clr-text);
    letter-spacing: .2px;
  }
  .pur-field label .req { color: var(--clr-danger); margin-left: 2px; }
  .pur-field .hint { font-size: .72rem; color: var(--clr-muted); margin-top: 3px; }

  .pur-input {
    padding: 9px 12px;
    border: 1.5px solid var(--clr-border);
    border-radius: 8px;
    font-size: .875rem;
    font-family: inherit;
    color: var(--clr-text);
    background: white;
    outline: none;
    transition: border-color .15s, box-shadow .15s;
    width: 100%;
    box-sizing: border-box;
  }
  .pur-input:focus { border-color: var(--clr-primary); box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
  .pur-input::placeholder { color: #94a3b8; }
  .pur-input-select {
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
    width: 100%;
    box-sizing: border-box;
    transition: border-color .15s;
  }
  .pur-input-select:focus { border-color: var(--clr-primary); box-shadow: 0 0 0 3px rgba(37,99,235,.1); }

  /* ── Empty state ── */
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

  /* ── Loading ── */
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

  /* ── misc ── */
  .pur-mono { font-family: 'JetBrains Mono', monospace; }
  .pur-text-right { text-align: right; }
  .pur-text-center { text-align: center; }
  
  /* ── Dropdown menu ── */
  .pur-dropdown {
    position: absolute;
    right: 0;
    top: 100%;
    background: #ffffff;
    border: 1px solid var(--clr-border);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    z-index: 50;
    min-width: 200px;
    overflow: hidden;
    margin-top: 4px;
  }
  .pur-dropdown-item {
    width: 100%;
    background: none;
    border: none;
    padding: 10px 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--clr-text);
    font-size: 13px;
    text-align: left;
    font-weight: 500;
    transition: background .12s;
  }
  .pur-dropdown-item:hover { background: var(--clr-row-hover); }
  .pur-dropdown-item.danger { color: var(--clr-danger); }
  .pur-dropdown-item.danger:hover { background: #fef2f2; }
  .pur-dropdown-separator {
    height: 1px;
    background: var(--clr-border);
    margin: 4px 0;
  }

  /* ── Items table in modal ── */
  .pur-items-table {
    width: 100%;
    border-collapse: collapse;
    font-size: .875rem;
    border: 1px solid var(--clr-border);
    border-radius: 8px;
    overflow: hidden;
  }
  .pur-items-table th {
    background: #f8faff;
    padding: 10px 12px;
    text-align: left;
    font-size: .7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5px;
    color: var(--clr-muted);
    border-bottom: 1px solid var(--clr-border);
  }
  .pur-items-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
  }
  .pur-items-table tr:last-child td { border-bottom: none; }
  .pur-items-table input {
    padding: 6px 8px;
    border: 1.5px solid var(--clr-border);
    border-radius: 6px;
    font-size: .875rem;
    width: 100%;
    box-sizing: border-box;
  }
  .pur-items-table input:focus { border-color: var(--clr-primary); outline: none; }
  .pur-items-table .narrow { width: 80px; }
  .pur-items-table .actions { width: 40px; text-align: center; }
  
  /* ── Summary box ── */
  .pur-summary {
    background: linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%);
    border: 1px solid var(--clr-border);
    border-radius: 12px;
    padding: 20px;
  }
  .pur-summary-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: .875rem;
  }
  .pur-summary-row.total {
    border-top: 2px solid var(--clr-border);
    margin-top: 8px;
    padding-top: 12px;
    font-size: 1.1rem;
    font-weight: 700;
  }
`;

// Format UGX currency
function formatUGX(n: number) {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    minimumFractionDigits: 0,
  }).format(n || 0);
}

// Status badge helpers
const STATUS_CONFIG: Record<string, { class: string; label: string }> = {
  DRAFT: { class: "pur-badge-draft", label: "Draft" },
  SUBMITTED: { class: "pur-badge-submitted", label: "Submitted" },
  APPROVED: { class: "pur-badge-approved", label: "Approved" },
  PARTIALLY_RECEIVED: { class: "pur-badge-partial", label: "Partial" },
  FULLY_RECEIVED: { class: "pur-badge-received", label: "Received" },
  CANCELLED: { class: "pur-badge-cancelled", label: "Cancelled" },
};

const PAYMENT_CONFIG: Record<string, { class: string; label: string }> = {
  UNPAID: { class: "pur-badge-unpaid", label: "Unpaid" },
  PARTIALLY_PAID: { class: "pur-badge-partial-paid", label: "Partial" },
  PAID: { class: "pur-badge-paid", label: "Paid" },
  OVERDUE: { class: "pur-badge-overdue", label: "Overdue" },
};

// UOM helper
const getUOMLabel = (uom: UnitOfMeasure | string): string => {
  const labels: Record<string, string> = {
    PIECES: "pcs",
    BOX: "box",
    PACK: "pack",
    BOTTLE: "bottle",
    VIAL: "vial",
    AMPULE: "amp",
    TABLET: "tab",
    CAPSULE: "cap",
    STRIP: "strip",
    TUBE: "tube",
    SYRINGE: "syringe",
    GLOVES_PAIR: "pair",
    ROLL: "roll",
    ML: "ml",
    LITER: "l",
    MG: "mg",
    G: "g",
    KG: "kg",
    INCH: "in",
    MM: "mm",
    SET: "set",
    KIT: "kit",
  };
  return labels[uom] || String(uom).toLowerCase();
};

// Field component for forms
function Field({ label, required, hint, children }: any) {
  return (
    <div className="pur-field">
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/* ─── Pagination Component ──────────────────────────────────────────────────── */
function PurPaginator({
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
        of <strong>{total}</strong> orders
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

/* ─── Main Purchases Page ─────────────────────────────────────────────────── */
export function PurchasesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ALL HOOKS MUST BE AT THE TOP LEVEL - never inside conditions or callbacks
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editPO, setEditPO] = useState<PurchaseOrder | null>(null);
  const [approvePO, setApprovePO] = useState<PurchaseOrder | null>(null);
  const [deliveryPO, setDeliveryPO] = useState<PurchaseOrder | null>(null); // ADD THIS
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // React Query hooks - must be at top level
  const { data: dashboard, isLoading: dashLoading } = usePurchaseDashboard();
  const { data: ordersData, isLoading: ordersLoading } = usePurchaseOrders({
    search: search || undefined,
    status: statusFilter || undefined,
    page,
    limit: 15,
  });
  const submitMutation = useSubmitPurchaseOrder();
  const cancelMutation = useCancelPurchaseOrder();

  // Derived values after hooks
  const orders: PurchaseOrder[] = Array.isArray(ordersData)
    ? ordersData
    : (ordersData?.data ?? []);
  const meta = Array.isArray(ordersData)
    ? { total: ordersData.length, totalPages: 1, page: 1 }
    : (ordersData?.meta ?? { total: 0, totalPages: 1, page: 1 });

  const lowStockCount =
    (dashboard?.lowStockItems?.length ?? 0) +
    (dashboard?.lowStockDrugs?.length ?? 0);

  // Event handlers using useCallback
  const handleSubmit = useCallback((id: string) => {
    submitMutation.mutate(id, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
    });
  }, [submitMutation, qc]);

  const handleCancel = useCallback((id: string) => {
    if (confirm("Are you sure you want to cancel this order?")) {
      cancelMutation.mutate(id, {
        onSuccess: () =>
          qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
      });
    }
  }, [cancelMutation, qc]);

  const handleDeliverySuccess = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    setDeliveryPO(null);
  }, [qc]);

  return (
    <div className="pur-root">
      <style>{STYLES}</style>

      {/* Header */}
      <div className="pur-header">
        <div className="pur-header-left">
          <h1>
            <span>Purchases</span>
          </h1>
          <p>Manage procurement, deliveries, and payments</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="pur-btn pur-btn-outline"
            onClick={() =>
              qc.invalidateQueries({ queryKey: ["purchase-orders"] })
            }
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            className="pur-btn pur-btn-primary"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={15} /> New Order
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="pur-stats">
        <div className="pur-stat blue">
          <div className="pur-stat-icon">
            <ShoppingBag size={22} />
          </div>
          <div className="pur-stat-body">
            <div className="pur-stat-label">Total Orders</div>
            <div className="pur-stat-value">{dashboard?.totalPOs ?? 0}</div>
            <div className="pur-stat-sub">
              {dashboard?.pendingPOs ?? 0} pending
            </div>
          </div>
        </div>
        <div className="pur-stat amber">
          <div className="pur-stat-icon">
            <CreditCard size={22} />
          </div>
          <div className="pur-stat-body">
            <div className="pur-stat-label">Outstanding</div>
            <div className="pur-stat-value" style={{ fontSize: "1.25rem" }}>
              {formatUGX(dashboard?.totalOutstanding ?? 0)}
            </div>
            <div className="pur-stat-sub">Unpaid balance</div>
          </div>
        </div>
        <div className="pur-stat green">
          <div className="pur-stat-icon">
            <CheckCircle size={22} />
          </div>
          <div className="pur-stat-body">
            <div className="pur-stat-label">Total Paid</div>
            <div className="pur-stat-value" style={{ fontSize: "1.25rem" }}>
              {formatUGX(dashboard?.totalPaid ?? 0)}
            </div>
            <div className="pur-stat-sub">All time</div>
          </div>
        </div>
        <div className={cn("pur-stat", lowStockCount > 0 ? "red" : "green")}>
          <div className="pur-stat-icon">
            <AlertTriangle size={22} />
          </div>
          <div className="pur-stat-body">
            <div className="pur-stat-label">Low Stock</div>
            <div className="pur-stat-value">{lowStockCount}</div>
            <div className="pur-stat-sub">
              {lowStockCount > 0 ? "Need reorder" : "All stocked"}
            </div>
          </div>
        </div>
      </div>

      {/* Low Stock Alert */}
      {/* {!dashLoading && lowStockCount > 0 && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <AlertTriangle size={18} color="#f59e0b" />
          <span style={{ fontSize: "0.875rem", color: "#92400e" }}>
            <strong>{lowStockCount} items</strong> need reorder. Check inventory
            levels.
          </span>
        </div>
      )} */}

      {/* Table Card */}
      <div className="pur-card">
        {/* Toolbar */}
        <div className="pur-toolbar">
          <div className="pur-search-wrap">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search PO number or supplier..."
            />
          </div>

          <select
            className="pur-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="PARTIALLY_RECEIVED">Partially Received</option>
            <option value="FULLY_RECEIVED">Fully Received</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <div className="pur-toolbar-right">
            {meta.total > 0 && (
              <span className="pur-count-badge">{meta.total} orders</span>
            )}
          </div>
        </div>

        {/* Table */}
        {ordersLoading ? (
          <div className="pur-loading">
            <div className="pur-spinner" /> Loading orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="pur-empty">
            <div className="icon-ring">
              <ShoppingBag size={28} />
            </div>
            <h3>No purchase orders found</h3>
            <p>
              {search
                ? `No results for "${search}"`
                : "Create your first purchase order to get started."}
            </p>
            {!search && (
              <button
                className="pur-btn pur-btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => setShowCreate(true)}
              >
                <Plus size={14} /> Create Order
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="pur-table-wrap">
              <table className="pur-table">
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Supplier</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th className="pur-text-right">Total</th>
                    <th className="pur-text-right">Balance</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((po) => {
                    const statusCfg = STATUS_CONFIG[po.status] || {
                      class: "pur-badge-draft",
                      label: po.status,
                    };
                    const payCfg = PAYMENT_CONFIG[po.paymentStatus] || {
                      class: "pur-badge-draft",
                      label: po.paymentStatus,
                    };
                    return (
                      <tr
                        key={po.id}
                        onClick={() => navigate(`/purchases/${po.id}`)}
                      >
                        <td>
                          <span
                            className="pur-mono"
                            style={{ fontWeight: 700, color: "#2563eb" }}
                          >
                            {po.poNumber}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>
                            {po.supplier?.name ?? "—"}
                          </div>
                          {po.paymentTerms && (
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--clr-muted)",
                              }}
                            >
                              {po.paymentTerms.replace(/_/g, " ")}
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            className="pur-badge"
                            style={{
                              background:
                                po.orderType === "DRUG" ? "#ede9fe" : "#dbeafe",
                              color:
                                po.orderType === "DRUG" ? "#6d28d9" : "#1d4ed8",
                              border: "none",
                            }}
                          >
                            {po.orderType === "DRUG" ? (
                              <Pill size={10} />
                            ) : (
                              <Package size={10} />
                            )}
                            {po.orderType === "DRUG" ? "Drug" : "Supply"}
                          </span>
                        </td>
                        <td>
                          <span className={cn("pur-badge", statusCfg.class)}>
                            {statusCfg.label}
                          </span>
                        </td>
                        <td>
                          <span className={cn("pur-badge", payCfg.class)}>
                            {payCfg.label}
                          </span>
                        </td>
                        <td className="pur-text-right pur-mono">
                          {formatUGX(po.total)}
                        </td>
                        <td
                          className="pur-text-right pur-mono"
                          style={{
                            color: po.balance > 0 ? "#d97706" : "#059669",
                            fontWeight: 600,
                          }}
                        >
                          {formatUGX(po.balance)}
                        </td>
                        <td
                          style={{
                            fontSize: "0.82rem",
                            color: "var(--clr-muted)",
                          }}
                        >
                          {po.createdAt
                            ? format(new Date(po.createdAt), "dd MMM yyyy")
                            : "—"}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="pur-row-actions">
                            <button
                              className="pur-action-btn view"
                              title="View"
                              onClick={() => navigate(`/purchases/${po.id}`)}
                            >
                              <Eye size={13} />
                            </button>
                            {["DRAFT", "SUBMITTED"].includes(po.status) && (
                              <button
                                className="pur-action-btn edit"
                                title="Edit"
                                onClick={() => setEditPO(po)}
                              >
                                <Edit2 size={13} />
                              </button>
                            )}
                            {po.status === "SUBMITTED" && (
                              <button
                                className="pur-action-btn approve"
                                title="Approve"
                                onClick={() => setApprovePO(po)}
                              >
                                <CheckCircle2 size={13} />
                              </button>
                            )}
                            {/* ADD DELIVERY BUTTON */}
                            {["APPROVED", "PARTIALLY_RECEIVED"].includes(po.status) && (
                              <button
                                className="pur-action-btn"
                                style={{ background: "#ecfdf5", color: "#059669" }}
                                title="Record Delivery"
                                onClick={() => setDeliveryPO(po)}
                              >
                                <Truck size={13} />
                              </button>
                            )}
                            <div style={{ position: "relative" }}>
                              <button
                                className="pur-action-btn"
                                style={{
                                  background: "#f3f4f6",
                                  color: "#6b7280",
                                }}
                                onClick={() =>
                                  setOpenMenu(openMenu === po.id ? null : po.id)
                                }
                              >
                                <MoreHorizontal size={13} />
                              </button>
                              {openMenu === po.id && (
                                <div className="pur-dropdown">
                                  <button
                                    className="pur-dropdown-item"
                                    onClick={() => {
                                      navigate(`/purchases/${po.id}`);
                                      setOpenMenu(null);
                                    }}
                                  >
                                    <Eye size={14} /> View Details
                                  </button>
                                  {po.status === "DRAFT" && (
                                    <>
                                      <button
                                        className="pur-dropdown-item"
                                        onClick={() => {
                                          handleSubmit(po.id);
                                          setOpenMenu(null);
                                        }}
                                      >
                                        <Send size={14} /> Submit for Approval
                                      </button>
                                      <div className="pur-dropdown-separator" />
                                      <button
                                        className="pur-dropdown-item danger"
                                        onClick={() => {
                                          handleCancel(po.id);
                                          setOpenMenu(null);
                                        }}
                                      >
                                        <XCircle size={14} /> Cancel Order
                                      </button>
                                    </>
                                  )}
                                  {po.status === "SUBMITTED" && (
                                    <button
                                      className="pur-dropdown-item"
                                      onClick={() => {
                                        setApprovePO(po);
                                        setOpenMenu(null);
                                      }}
                                    >
                                      <CheckCircle2
                                        size={14}
                                        style={{ color: "#059669" }}
                                      />{" "}
                                      Approve
                                    </button>
                                  )}
                                  {["APPROVED", "PARTIALLY_RECEIVED"].includes(
                                    po.status,
                                  ) && (
                                    <button
                                      className="pur-dropdown-item"
                                      onClick={() => {
                                        setDeliveryPO(po);
                                        setOpenMenu(null);
                                      }}
                                    >
                                      <Truck size={14} /> Record Delivery
                                    </button>
                                  )}
                                  {po.paymentStatus !== "PAID" &&
                                    po.status !== "CANCELLED" && (
                                      <button
                                        className="pur-dropdown-item"
                                        onClick={() => {
                                          navigate(
                                            `/purchases/${po.id}?action=payment`,
                                          );
                                          setOpenMenu(null);
                                        }}
                                      >
                                        <CreditCard size={14} /> Record Payment
                                      </button>
                                    )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <PurPaginator
              page={page}
              totalPages={meta.totalPages || 1}
              total={meta.total || 0}
              limit={15}
              onChange={setPage}
            />
          </>
        )}
      </div>

      {/* Modals - Rendered conditionally but hooks are always at top level */}
      {showCreate && (
        <CreatePurchaseOrderModal onClose={() => setShowCreate(false)} />
      )}
      
      {editPO && (
        <EditPurchaseOrderModal po={editPO} onClose={() => setEditPO(null)} />
      )}

      {approvePO && (
        <ApprovePurchaseOrderModal
          po={approvePO}
          onClose={() => setApprovePO(null)}
        />
      )}

      {deliveryPO && (
        <RecordDeliveryModal
          purchaseOrder={deliveryPO}
          onClose={() => setDeliveryPO(null)}
          onSuccess={handleDeliverySuccess}
        />
      )}
    </div>
  );
}

export default PurchasesPage;