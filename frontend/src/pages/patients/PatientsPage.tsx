// src/pages/patients/PatientsPage.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { patientsApi } from "../../lib/api/patients";
import type { Patient } from "@/types/patients";

import { formatDate, getAge, getInitials, cn } from "../../lib/utils";
import {
  PageHeader,
  StatCard,
  SearchBar,
  Button,
  Table,
  Tr,
  Td,
  LoadingSpinner,
  EmptyState,
  Pagination,
  Modal,
  FormField,
  Input,
  Select,
} from "../../components/shared";
import {
  Users,
  Plus,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText,
  Eye,
  Edit2,
  Search,
  Filter,
  ChevronDown,
  X,
  Activity,
  UserCheck,
  UserPlus,
  TrendingUp,
  Grid,
  List,
  RefreshCw,
  Stethoscope,
  AlertCircle,
  CheckCircle,
  Clock,
} from "lucide-react";

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    totalPages: number;
    limit?: number;
  };
}

/* ─── Inline styles injected once ─────────────────────────────────────────── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  .pts-root {
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
  .pts-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pts-header-left h1 {
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--clr-text);
    letter-spacing: -.5px;
    line-height: 1;
  }
  .pts-header-left p {
    margin-top: 4px;
    font-size: .875rem;
    color: var(--clr-muted);
  }
  .pts-header-left h1 span { color: var(--clr-primary); }

  /* ── Stat cards ── */
  .pts-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }
  @media (max-width: 900px) { .pts-stats { grid-template-columns: repeat(2,1fr); } }
  .pts-stat {
    background: var(--clr-surface);
    border-radius: var(--radius);
    padding: 20px;
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--clr-border);
    display: flex;
    align-items: center;
    gap: 16px;
    position: relative;
    overflow: hidden;
    transition: transform .18s, box-shadow .18s;
  }
  .pts-stat:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
  .pts-stat::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    border-radius: 12px 12px 0 0;
  }
  .pts-stat.blue::before   { background: linear-gradient(90deg, #2563eb, #06b6d4); }
  .pts-stat.green::before  { background: linear-gradient(90deg, #10b981, #34d399); }
  .pts-stat.indigo::before { background: linear-gradient(90deg, #6366f1, #818cf8); }
  .pts-stat.amber::before  { background: linear-gradient(90deg, #f59e0b, #fcd34d); }
  .pts-stat-icon {
    width: 48px; height: 48px;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .pts-stat.blue   .pts-stat-icon { background: #eff6ff; color: #2563eb; }
  .pts-stat.green  .pts-stat-icon { background: #ecfdf5; color: #10b981; }
  .pts-stat.indigo .pts-stat-icon { background: #eef2ff; color: #6366f1; }
  .pts-stat.amber  .pts-stat-icon { background: #fffbeb; color: #f59e0b; }
  .pts-stat-body { flex: 1; }
  .pts-stat-label { font-size: .75rem; font-weight: 600; color: var(--clr-muted); text-transform: uppercase; letter-spacing: .5px; }
  .pts-stat-value { font-size: 1.75rem; font-weight: 800; color: var(--clr-text); line-height: 1.1; margin-top: 2px; }
  .pts-stat-sub   { font-size: .75rem; color: var(--clr-muted); margin-top: 2px; }

  /* ── Card / table wrapper ── */
  .pts-card {
    background: var(--clr-surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--clr-border);
    overflow: hidden;
  }

  /* ── Toolbar ── */
  .pts-toolbar {
    padding: 6px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--clr-border);
    flex-wrap: wrap;
    background: #fafbff;
  }
  .pts-search-wrap {
    position: relative;
    flex: 1;
    min-width: 200px;
    max-width: 340px;
  }
  .pts-search-wrap svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--clr-muted); pointer-events: none; }
  .pts-search-wrap input {
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
  .pts-search-wrap input:focus { border-color: var(--clr-primary); box-shadow: 0 0 0 3px rgba(37,99,235,.12); }
  .pts-search-wrap input::placeholder { color: #94a3b8; }

  .pts-select {
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
  .pts-select:focus { border-color: var(--clr-primary); box-shadow: 0 0 0 3px rgba(37,99,235,.12); }

  .pts-btn {
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
  .pts-btn-primary {
    background: var(--clr-primary);
    color: white;
    box-shadow: 0 2px 8px rgba(37,99,235,.30);
  }
  .pts-btn-primary:hover { background: var(--clr-primary-d); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(37,99,235,.35); }
  .pts-btn-outline {
    background: white;
    color: var(--clr-text);
    border: 1.5px solid var(--clr-border);
  }
  .pts-btn-outline:hover { border-color: var(--clr-primary); color: var(--clr-primary); background: var(--clr-primary-l); }
  .pts-btn-sm { padding: 6px 12px; font-size: .8rem; }
  .pts-btn-icon { padding: 7px; border-radius: 7px; }
  .pts-btn-danger { background: #fef2f2; color: var(--clr-danger); border: 1.5px solid #fecaca; }
  .pts-btn-danger:hover { background: var(--clr-danger); color: white; }

  .pts-toolbar-right { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .pts-count-badge {
    background: var(--clr-primary-l);
    color: var(--clr-primary);
    font-size: .75rem;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 99px;
    border: 1px solid #bfdbfe;
  }

  /* ── Data table ── */
  .pts-table-wrap { overflow-x: auto; }
  .pts-table {
    width: 100%;
    border-collapse: collapse;
    font-size: .875rem;
  }
  .pts-table thead tr {
    background: #f8faff;
    border-bottom: 2px solid var(--clr-border);
  }
  .pts-table thead th {
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
  .pts-table thead th:hover { color: var(--clr-primary); }
  .pts-table thead th.sort-asc::after  { content: ' ↑'; color: var(--clr-primary); }
  .pts-table thead th.sort-desc::after { content: ' ↓'; color: var(--clr-primary); }

  .pts-table tbody tr {
    border-bottom: 1px solid #f1f5f9;
    transition: background .12s;
    cursor: pointer;
  }
  .pts-table tbody tr:last-child { border-bottom: none; }
  .pts-table tbody tr:hover { background: var(--clr-row-hover); }
  .pts-table tbody tr:hover .pts-row-actions { opacity: 1; }
  .pts-table td { padding: 12px 16px; vertical-align: middle; }

  /* ── Avatar ── */
  .pts-avatar {
    width: 38px; height: 38px;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: .8rem;
    font-weight: 700;
    flex-shrink: 0;
  }
  .pts-avatar-blue   { background: #dbeafe; color: #1d4ed8; }
  .pts-avatar-pink   { background: #fce7f3; color: #be185d; }
  .pts-avatar-green  { background: #d1fae5; color: #065f46; }
  .pts-avatar-purple { background: #ede9fe; color: #6d28d9; }
  .pts-avatar-amber  { background: #fef3c7; color: #92400e; }

  .pts-patient-name { font-weight: 700; color: var(--clr-text); line-height: 1.2; }
  .pts-patient-code { font-family: 'JetBrains Mono', monospace; font-size: .7rem; color: var(--clr-muted); margin-top: 2px; }

  /* ── Badges ── */
  .pts-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 6px;
    font-size: .72rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .pts-badge-active   { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
  .pts-badge-inactive { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
  .pts-badge-male     { background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe; }
  .pts-badge-female   { background: #fce7f3; color: #be185d; border: 1px solid #fbcfe8; }
  .pts-badge-other    { background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
  .pts-badge-appt     { background: #ede9fe; color: #6d28d9; border: 1px solid #ddd6fe; }

  /* ── Row actions ── */
  .pts-row-actions { opacity: 1; display: flex; gap: 4px; transition: opacity .15s; }
  .pts-action-btn {
  width: 30px; height: 30px;
  border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  border: none;
  transition: all .12s;
  flex-shrink: 0;
}
  .pts-action-btn.view  { background: var(--clr-primary-l); color: var(--clr-primary); }
  .pts-action-btn.view:hover  { background: var(--clr-primary); color: white; }
  .pts-action-btn.edit  { background: #f0fdf4; color: #16a34a; }
  .pts-action-btn.edit:hover  { background: #16a34a; color: white; }

  /* ── Pagination ── */
  .pts-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-top: 1px solid var(--clr-border);
    background: #fafbff;
    flex-wrap: wrap;
    gap: 12px;
  }
  .pts-pager-info { font-size: .82rem; color: var(--clr-muted); }
  .pts-pager-info strong { color: var(--clr-text); }
  .pts-pager-btns { display: flex; gap: 4px; }
  .pts-page-btn {
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
  .pts-page-btn:hover:not(:disabled) { border-color: var(--clr-primary); color: var(--clr-primary); background: var(--clr-primary-l); }
  .pts-page-btn.active { background: var(--clr-primary); color: white; border-color: var(--clr-primary); }
  .pts-page-btn:disabled { opacity: .4; cursor: default; }

  /* ── Modal overlay ── */
  .pts-overlay {
    position: fixed; inset: 0;
    background: rgba(15,23,42,.5);
    backdrop-filter: blur(4px);
    z-index: 50;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    animation: fadeIn .15s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .pts-modal {
    background: white;
    border-radius: 16px;
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 760px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    animation: slideUp .2s ease;
  }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.pts-modal-header {
  padding: 10px 24px 6px;
  border-bottom: 1px solid rgba(255,255,255,0.2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  background: #376dec; /* ← Your requested color */
}
.pts-modal-header h2 {
  font-size: 1.15rem;
  font-weight: 800;
  color: white; /* ← White text */
  display: flex; align-items: center; gap: 10px;
}
.pts-modal-header h2 .icon-wrap {
  width: 36px; height: 36px;
  background: rgba(255,255,255,0.2); /* ← Subtle white overlay for icon bg */
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  color: white; /* ← White icon */
}
.pts-modal-close {
  width: 34px; height: 34px;
  border-radius: 8px;
  border: 1.5px solid rgba(255,255,255,0.3); /* ← Visible border on blue */
  background: rgba(255,255,255,0.15);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: white; /* ← White close icon */
  transition: all .12s;
}
.pts-modal-close:hover { 
  background: rgba(255,255,255,0.3); 
  border-color: white; 
}

  .pts-modal-close {
    width: 34px; height: 34px;
    border-radius: 8px;
    border: 1.5px solid var(--clr-border);
    background: white;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: var(--clr-muted);
    transition: all .12s;
  }
  .pts-modal-close:hover { background: #fee2e2; color: var(--clr-danger); border-color: #fecaca; }

  .pts-modal-body {
    overflow-y: auto;
    padding: 24px;
    flex: 1;
  }
  .pts-modal-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--clr-border);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    flex-shrink: 0;
    background: #fafbff;
  }

  /* ── Form sections ── */
  .pts-form-section {
    margin-bottom: 8px;
  }
  .pts-form-section:last-child { margin-bottom: 0; }
  .pts-section-label {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    padding-bottom: 5px;
    border-bottom: 2px solid var(--clr-border);
  }
  .pts-section-label .num {
    width: 22px; height: 22px;
    background: var(--clr-primary);
    color: white;
    border-radius: 6px;
    font-size: .72rem;
    font-weight: 800;
    display: flex; align-items: center; justify-content: center;
  }
  .pts-section-label span {
    font-size: .82rem;
    font-weight: 700;
    color: var(--clr-text);
    text-transform: uppercase;
    letter-spacing: .5px;
  }

  .pts-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .pts-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  @media (max-width: 600px) { .pts-grid-2, .pts-grid-3 { grid-template-columns: 1fr; } }

  .pts-field { display: flex; flex-direction: column; gap: 5px; }
  .pts-field label {
    font-size: .77rem;
    font-weight: 700;
    color: var(--clr-text);
    letter-spacing: .2px;
  }
  .pts-field label .req { color: var(--clr-danger); margin-left: 2px; }
  .pts-field .hint { font-size: .72rem; color: var(--clr-muted); margin-top: 3px; }
  .pts-field .error { font-size: .7rem; color: var(--clr-danger); margin-top: 2px; }

  .pts-input {
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
  .pts-input:focus { border-color: var(--clr-primary); box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
  .pts-input::placeholder { color: #94a3b8; }
  .pts-input-error { border-color: var(--clr-danger) !important; }
  .pts-input-select {
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
  .pts-input-select:focus { border-color: var(--clr-primary); box-shadow: 0 0 0 3px rgba(37,99,235,.1); }

  /* ── Empty state ── */
  .pts-empty {
    padding: 64px 24px;
    text-align: center;
  }
  .pts-empty .icon-ring {
    width: 72px; height: 72px;
    background: var(--clr-primary-l);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 16px;
    color: var(--clr-primary);
  }
  .pts-empty h3 { font-size: 1rem; font-weight: 700; color: var(--clr-text); }
  .pts-empty p  { font-size: .875rem; color: var(--clr-muted); margin-top: 4px; }

  /* ── Loading ── */
  .pts-loading {
    padding: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--clr-muted);
    font-size: .875rem;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .pts-spinner {
    width: 22px; height: 22px;
    border: 2.5px solid var(--clr-border);
    border-top-color: var(--clr-primary);
    border-radius: 50%;
    animation: spin .7s linear infinite;
  }

  /* ── misc ── */
  .pts-mono { font-family: 'JetBrains Mono', monospace; }
  .pts-contact-line { display: flex; align-items: center; gap: 5px; color: #475569; font-size: .8rem; }
  .pts-contact-line svg { opacity: .5; flex-shrink: 0; }
`;

/* ─── Avatar color helper ───────────────────────────────────────────────────── */
const AVATAR_COLORS = ["blue", "pink", "green", "purple", "amber"];
function avatarColor(name: string) {
  const sum = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

/* ─── Inline Pagination ─────────────────────────────────────────────────────── */
function PtsPageinator({
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
    <div className="pts-pager">
      <div className="pts-pager-info">
        Showing{" "}
        <strong>
          {from}–{to}
        </strong>{" "}
        of <strong>{total}</strong> patients
      </div>
      <div className="pts-pager-btns">
        <button
          className="pts-page-btn"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span
              key={i}
              className="pts-page-btn"
              style={{ border: "none", cursor: "default" }}
            >
              …
            </span>
          ) : (
            <button
              key={i}
              className={`pts-page-btn${page === p ? " active" : ""}`}
              onClick={() => onChange(p as number)}
            >
              {p}
            </button>
          ),
        )}
        <button
          className="pts-page-btn"
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}

/* ─── Form Modal (shared for Add + Edit) ───────────────────────────────────── */
const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  phone: "",
  // email: "",
  gender: "",
  address: "",
  city: "",
  age: "",
  bloodGroup: "",
  allergies: "",
  medicalConditions: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelation: "",
  // occupation: "",
  previousCardNumber: "",
};

// ─── Age ↔ DateOfBirth Helpers ─────────────────────────────────────
function calculateYearOfBirth(age: number): number {
  const currentYear = new Date().getFullYear();
  return currentYear - age;
}

function calculateAge(dateOfBirth: string | Date): string {
  if (!dateOfBirth) return "";
  const birthYear = new Date(dateOfBirth).getFullYear();
  const currentYear = new Date().getFullYear();
  return String(currentYear - birthYear);
}

function ageToDateOfBirth(age: string): string | null {
  const ageNum = parseInt(age, 10);
  if (isNaN(ageNum) || ageNum < 0 || ageNum > 120) return null;
  const year = calculateYearOfBirth(ageNum);
  return `${year}-01-01`;
}

function PatientFormModal({
  open,
  onClose,
  onSubmit,
  loading,
  initial,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
  initial?: any;
  mode: "add" | "edit";
}) {
  const [form, setForm] = useState<any>(() =>
    initial
      ? {
          ...EMPTY_FORM,
          ...initial,
          allergies: Array.isArray(initial.allergies)
            ? initial.allergies.join(", ")
            : initial.allergies || "",
          medicalConditions: Array.isArray(initial.medicalConditions)
            ? initial.medicalConditions.join(", ")
            : initial.medicalConditions || "",
        }
      : EMPTY_FORM,
  );

  // Validation errors state
  const [errors, setErrors] = useState<{
    firstName?: string;
    lastName?: string;
    phone?: string;
    age?: string;
    gender?: string;
  }>({});

  // ✅ Properly sync form when modal opens or initial data changes
  useEffect(() => {
    if (open && initial) {
      const formatDateForInput = (dateValue: any): string => {
        if (!dateValue) return "";
        // Already in YYYY-MM-DD format
        if (
          typeof dateValue === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
        ) {
          return dateValue;
        }
        try {
          const d = new Date(dateValue);
          if (isNaN(d.getTime())) return "";
          return d.toISOString().split("T")[0];
        } catch {
          return "";
        }
      };

      setForm({
        ...EMPTY_FORM,
        ...initial,
        // Format date properly for <input type="date">
        dateOfBirth: formatDateForInput(initial.dateOfBirth),
        age: initial.dateOfBirth ? calculateAge(initial.dateOfBirth) : "",
        // Handle array fields
        allergies: Array.isArray(initial.allergies)
          ? initial.allergies.join(", ")
          : initial.allergies || "",
        medicalConditions: Array.isArray(initial.medicalConditions)
          ? initial.medicalConditions.join(", ")
          : initial.medicalConditions || "",
      });
      setErrors({});
    } else if (open && !initial) {
      // Reset to empty form for "Add" mode
      setForm(EMPTY_FORM);
      setErrors({});
    }
  }, [open, initial]);

  // Clear errors when form field changes
  const handleFieldChange = (field: string, value: string) => {
    setForm((prev: any) => ({ ...prev, [field]: value }));
    if (errors[field as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    if (!form.firstName?.trim()) newErrors.firstName = "First name is required";
    if (!form.lastName?.trim()) newErrors.lastName = "Last name is required";
    if (!form.phone?.trim()) newErrors.phone = "Phone number is required";
    const ageNum = parseInt(form.age, 10);
    if (!form.age || isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
      newErrors.age = "Valid age (0-120) is required";
    }
    if (!form.gender) newErrors.gender = "Gender is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      onSubmit(form);
    }
  };

  if (!open) return null;

  return (
    <div
      className="pts-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pts-modal">
        <div className="pts-modal-header">
          <h2>
            <span className="icon-wrap">
              {mode === "add" ? <UserPlus size={16} /> : <Edit2 size={16} />}
            </span>
            {mode === "add" ? "Register New Patient" : "Edit Patient Record"}
          </h2>
          <button className="pts-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="pts-modal-body">
          {/* Section 1 */}
          <div className="pts-form-section">
            <div className="pts-section-label">
              <span className="num">1</span>
              <span>Personal Information</span>
            </div>
            <div className="pts-grid-2">
              <Field label="First Name" required error={errors.firstName}>
                <input
                  className={`pts-input ${errors.firstName ? "pts-input-error" : ""}`}
                  value={form.firstName}
                  onChange={(e) =>
                    handleFieldChange("firstName", e.target.value)
                  }
                  placeholder="John"
                />
              </Field>
              <Field label="Last Name" required error={errors.lastName}>
                <input
                  className={`pts-input ${errors.lastName ? "pts-input-error" : ""}`}
                  value={form.lastName}
                  onChange={(e) =>
                    handleFieldChange("lastName", e.target.value)
                  }
                  placeholder="Doe"
                />
              </Field>
              <Field label="Age (years)" required error={errors.age}>
                <input
                  className={`pts-input ${errors.age ? "pts-input-error" : ""}`}
                  value={form.age}
                  onChange={(e) => {
                    // Only allow numbers
                    const value = e.target.value.replace(/[^0-9]/g, "");
                    handleFieldChange("age", value);
                  }}
                  type="number"
                  min="0"
                  max="120"
                  placeholder="e.g., 35"
                />
              </Field>
              <Field label="Phone Number" required error={errors.phone}>
                <input
                  className={`pts-input ${errors.phone ? "pts-input-error" : ""}`}
                  value={form.phone}
                  onChange={(e) => handleFieldChange("phone", e.target.value)}
                  placeholder="+256 700 000 000"
                  type="tel"
                />
              </Field>
              <Field label="Gender" required error={errors.gender}>
                <select
                  className={`pts-input-select ${errors.gender ? "pts-input-error" : ""}`}
                  value={form.gender}
                  onChange={(e) => handleFieldChange("gender", e.target.value)}
                  required
                >
                  <option value="">Select gender</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </Field>
              <Field label="City">
                <input
                  className="pts-input"
                  value={form.city}
                  onChange={(e) => handleFieldChange("city", e.target.value)}
                  placeholder="Kampala"
                />
              </Field>
              <Field label="Address">
                <input
                  className="pts-input"
                  value={form.address}
                  onChange={(e) => handleFieldChange("address", e.target.value)}
                  placeholder="Street address"
                />
              </Field>
              {/* <Field label="Occupation">
                <input
                  className="pts-input"
                  value={form.occupation}
                  onChange={(e) =>
                    handleFieldChange("occupation", e.target.value)
                  }
                  placeholder="Teacher, Engineer..."
                />
              </Field> */}
              <Field
                label="Previous Card / File Number"
                // hint="Patient's old physical card number"
              >
                <input
                  className="pts-input pts-mono"
                  value={form.previousCardNumber}
                  onChange={(e) =>
                    handleFieldChange("previousCardNumber", e.target.value)
                  }
                  placeholder="e.g. OPD-2019-00412"
                />
              </Field>
            </div>
          </div>

                    {/* Section 3 - Medical History (unchanged) */}
          <div className="pts-form-section">
            <div className="pts-section-label">
              <span className="num">2</span>
              <span>Medical History</span>
            </div>
            <div className="pts-grid-2">
              <Field
                label="Allergies"
                hint="Comma-separated: Penicillin, Aspirin"
              >
                <input
                  className="pts-input"
                  value={form.allergies}
                  onChange={(e) =>
                    handleFieldChange("allergies", e.target.value)
                  }
                  placeholder="Penicillin, Aspirin..."
                />
              </Field>
              <Field
                label="Medical Conditions"
                hint="Comma-separated: Diabetes, Hypertension"
              >
                <input
                  className="pts-input"
                  value={form.medicalConditions}
                  onChange={(e) =>
                    handleFieldChange("medicalConditions", e.target.value)
                  }
                  placeholder="Diabetes, Hypertension..."
                />
              </Field>
            </div>
          </div>

          {/* Section 2 - Emergency Contact (unchanged) */}
          <div className="pts-form-section">
            <div className="pts-section-label">
              <span className="num">3</span>
              <span>Emergency Contact</span>
            </div>
            <div className="pts-grid-3">
              <Field label="Contact Name">
                <input
                  className="pts-input"
                  value={form.emergencyContactName}
                  onChange={(e) =>
                    handleFieldChange("emergencyContactName", e.target.value)
                  }
                  placeholder="Jane Doe"
                />
              </Field>
              <Field label="Contact Phone">
                <input
                  className="pts-input"
                  value={form.emergencyContactPhone}
                  onChange={(e) =>
                    handleFieldChange("emergencyContactPhone", e.target.value)
                  }
                  placeholder="+256 700 000 001"
                />
              </Field>
              <Field label="Relationship">
                <select
                  className="pts-input-select"
                  value={form.emergencyContactRelation}
                  onChange={(e) =>
                    handleFieldChange(
                      "emergencyContactRelation",
                      e.target.value,
                    )
                  }
                >
                  <option value="">Select</option>
                  {[
                    "Spouse",
                    "Parent",
                    "Child",
                    "Sibling",
                    "Friend",
                    "Other",
                  ].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

        </div>

        <div className="pts-modal-footer">
          <button
            className="pts-btn pts-btn-outline"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="pts-btn pts-btn-primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <>
                <span
                  className="pts-spinner"
                  style={{ width: 14, height: 14, borderWidth: 2 }}
                />
                Saving…
              </>
            ) : mode === "add" ? (
              <>
                <UserPlus size={15} />
                Register Patient
              </>
            ) : (
              <>
                <CheckCircle size={15} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* tiny helper component */
function Field({ label, required, hint, children, error }: any) {
  return (
    <div className="pts-field">
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
      {error && <div className="error">{error}</div>}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */
export function PatientsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [genderFilter, setGender] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editPatient, setEditPatient] = useState<any>(null);

  const {
    data: patientsResp,
    isLoading,
    refetch,
  } = useQuery<{ data: Patient[]; meta: any | null }>({
    queryKey: ["patients", { page, search, genderFilter, dateFrom, dateTo }],
    queryFn: () => {
      const params: Record<string, string | number> = {
        page,
        limit: 15,
      };
      if (search?.trim()) params.search = search.trim();
      if (genderFilter) params.gender = genderFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      return patientsApi.getAllWithMeta(params);
    },
    placeholderData: (previousData) => previousData,
  });

  const { data: stats } = useQuery({
    queryKey: ["patient-stats"],
    queryFn: patientsApi.getStats,
  });

  const preparePayload = (d: any, originalDateOfBirth?: string | Date) => {
    const cleaned: any = {};

    // Copy non-empty fields
    Object.keys(d).forEach((key) => {
      const value = d[key];
      if (value === "" || value === null || value === undefined) return;
      cleaned[key] = value;
    });

    // Convert age to dateOfBirth, preserving original DOB if age hasn't changed during edit
    if (cleaned.age) {
      if (originalDateOfBirth) {
        const originalAge = calculateAge(originalDateOfBirth);
        if (String(originalAge) === String(cleaned.age)) {
          cleaned.dateOfBirth = new Date(originalDateOfBirth).toISOString();
          delete cleaned.age;
        } else {
          const dob = ageToDateOfBirth(cleaned.age);
          if (dob) cleaned.dateOfBirth = new Date(dob).toISOString();
          delete cleaned.age;
        }
      } else {
        // Add mode – always derive from age
        const dob = ageToDateOfBirth(cleaned.age);
        if (dob) cleaned.dateOfBirth = new Date(dob).toISOString();
        delete cleaned.age;
      }
    } else {
      delete cleaned.dateOfBirth;
    }

    // Arrays from comma-separated strings
    if (cleaned.allergies) {
      cleaned.allergies = cleaned.allergies
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
    if (cleaned.medicalConditions) {
      cleaned.medicalConditions = cleaned.medicalConditions
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }

    return cleaned;
  };

  const addMutation = useMutation({
    mutationFn: (d: any) => patientsApi.create(preparePayload(d)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["patient-stats"] });
      setShowAdd(false);
    },
    onError: (error: any) => {
      if (error.response?.status === 400 && error.response?.data?.message) {
        const errors = error.response.data.message;
        alert(`Validation error:\n${errors.join("\n")}`);
      } else {
        alert("Failed to create patient. Please try again.");
      }
    },
  });

  const editMutation = useMutation({
    mutationFn: (d: any) =>
      patientsApi.update(
        editPatient.id,
        preparePayload(d, editPatient.dateOfBirth), // ← Pass original DOB for edit
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      setEditPatient(null);
    },
    onError: (error: any) => {
      if (error.response?.status === 400 && error.response?.data?.message) {
        const errors = error.response.data.message;
        alert(`Validation error:\n${errors.join("\n")}`);
      } else {
        alert("Failed to update patient. Please try again.");
      }
    },
  });

  const patients = patientsResp?.data || [];
  const apiMeta = patientsResp?.meta;

  // Prefer the server-provided meta (real totals) — fall back to length-based
  // estimate only if the API didn't return meta (legacy responses).
  const meta = apiMeta ?? {
    total: patients.length,
    page,
    totalPages: Math.max(1, Math.ceil(patients.length / 15)),
    limit: 15,
  };

  return (
    <div className="pts-root">
      <style>{STYLES}</style>

      {/* ── Header ── */}
      <div className="pts-header">
        <div className="pts-header-left">
          <h1>
            <span>Patient</span> Records
          </h1>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="pts-btn pts-btn-outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["patients"] })}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            className="pts-btn pts-btn-primary"
            onClick={() => setShowAdd(true)}
          >
            <Plus size={15} /> New Patient
          </button>
        </div>
      </div>

      {/* ── Table Card ── */}
      <div className="pts-card">
        {/* Toolbar */}
        <div className="pts-toolbar">
          <div className="pts-search-wrap">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, code, phone…"
            />
          </div>

          <select
            className="pts-select"
            value={genderFilter}
            onChange={(e) => {
              setGender(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Genders</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>

          {/* ── Registered date range filter ─────────────────────────────── */}
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
            title="Filter by registration date"
          >
            <Calendar size={13} style={{ color: "var(--clr-muted)" }} />
            <input
              type="date"
              aria-label="Registered from"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
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
              aria-label="Registered to"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
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
            {(dateFrom || dateTo) && (
              <button
                type="button"
                aria-label="Clear date filter"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
                style={{
                  border: "none",
                  background: "transparent",
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

          {/* <select className="pts-select">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select> */}

          <div className="pts-toolbar-right">
            {meta.total > 0 && (
              <span className="pts-count-badge">{meta.total} patients</span>
            )}
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="pts-loading">
            <div className="pts-spinner" /> Loading patients…
          </div>
        ) : patients.length === 0 ? (
          <div className="pts-empty">
            <div className="icon-ring">
              <Users size={28} />
            </div>
            <h3>No patients found</h3>
            <p>
              {search
                ? `No results for "${search}"`
                : "Register your first patient to get started."}
            </p>
            {!search && (
              <button
                className="pts-btn pts-btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => setShowAdd(true)}
              >
                <Plus size={14} /> Add Patient
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="pts-table-wrap">
              <table className="pts-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Patient</th>
                    <th>Contact</th>
                    <th>Gender</th>
                    <th>D.O.B / Age</th>
                    <th>Registered</th>
                    <th>Card No.</th>
                    <th>Visits</th>
                    {/* <th>Status</th> */}
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {patients.map((p: any, i: number) => {
                    const color = avatarColor(`${p.firstName}${p.lastName}`);
                    const genderLabel =
                      p.gender === "MALE"
                        ? "Male"
                        : p.gender === "FEMALE"
                          ? "Female"
                          : p.gender
                            ? "Other"
                            : "—";
                    const genderClass =
                      p.gender === "MALE"
                        ? "pts-badge-male"
                        : p.gender === "FEMALE"
                          ? "pts-badge-female"
                          : "pts-badge-other";
                    const fullName = [p.firstName, p.lastName]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <tr
                        key={p.id}
                        onClick={() => navigate(`/patients/${p.id}`)}
                      >
                        <td
                          style={{
                            color: "#94a3b8",
                            fontSize: ".78rem",
                            fontWeight: 600,
                            width: 40,
                          }}
                        >
                          {(page - 1) * 15 + i + 1}
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <div className={`pts-avatar pts-avatar-${color}`}>
                              {p.firstName?.[0]}
                              {p.lastName?.[0]}
                            </div>
                            <div>
                              <div className="pts-patient-name">{fullName}</div>
                              <div className="pts-patient-code">
                                {p.patientCode}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                            }}
                          >
                            {p.phone && (
                              <div className="pts-contact-line">
                                <Phone size={11} />
                                {p.phone}
                              </div>
                            )}
                            {/* {p.email && (
                              <div className="pts-contact-line">
                                <Mail size={11} />
                                {p.email}
                              </div>
                            )} */}
                          </div>
                        </td>
                        <td>
                          {p.gender ? (
                            <span className={`pts-badge ${genderClass}`}>
                              {genderLabel}
                            </span>
                          ) : (
                            <span style={{ color: "#cbd5e1" }}>—</span>
                          )}
                        </td>
                        {/* In the table's D.O.B / Age column */}
                        <td style={{ color: "#475569", fontSize: ".82rem" }}>
                          {p.dateOfBirth ? (
                            <>
                              <span style={{ fontWeight: 600 }}>
                                {getAge(p.dateOfBirth)} yrs
                              </span>
                              <br />
                              <span
                                style={{ color: "#94a3b8", fontSize: ".7rem" }}
                              >
                                Born: {formatDate(p.dateOfBirth)}
                              </span>
                            </>
                          ) : (
                            <span style={{ color: "#cbd5e1" }}>—</span>
                          )}
                        </td>
                        {/* Registered (createdAt/registeredAt) column */}
                        <td
                          style={{
                            color: "#475569",
                            fontSize: ".82rem",
                            whiteSpace: "nowrap",
                          }}
                          title={
                            p.registeredAt
                              ? new Date(p.registeredAt).toLocaleString()
                              : p.createdAt
                                ? new Date(p.createdAt).toLocaleString()
                                : ""
                          }
                        >
                          {p.registeredAt || p.createdAt ? (
                            <>
                              <span style={{ fontWeight: 600 }}>
                                {formatDate(p.registeredAt || p.createdAt)}
                              </span>
                              <br />
                              <span
                                style={{ color: "#94a3b8", fontSize: ".7rem" }}
                              >
                                {new Date(
                                  p.registeredAt || p.createdAt,
                                ).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </>
                          ) : (
                            <span style={{ color: "#cbd5e1" }}>—</span>
                          )}
                        </td>
                        <td>
                          {p.previousCardNumber ? (
                            <span
                              className="pts-mono"
                              style={{
                                fontSize: ".78rem",
                                color: "#475569",
                                background: "#f1f5f9",
                                padding: "2px 7px",
                                borderRadius: 5,
                              }}
                            >
                              {p.previousCardNumber}
                            </span>
                          ) : (
                            <span style={{ color: "#cbd5e1" }}>—</span>
                          )}
                        </td>
                        <td>
                          <span className="pts-badge pts-badge-appt">
                            {p._count?.appointments || 0} visits
                          </span>
                        </td>
                        <td>
                          <div className="pts-row-actions">
                            <button
                              className="pts-action-btn view"
                              title="View"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/patients/${p.id}`);
                              }}
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              className="pts-action-btn edit"
                              title="Edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditPatient(p);
                              }}
                            >
                              <Edit2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <PtsPageinator
              page={page}
              totalPages={meta.totalPages || 1}
              total={meta.total || 0}
              limit={15}
              onChange={setPage}
            />
          </>
        )}
      </div>

      {/* ── Add Modal ── */}
      <PatientFormModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={(d) => addMutation.mutate(d)}
        loading={addMutation.isPending}
        mode="add"
      />

      {/* ── Edit Modal ── */}
      <PatientFormModal
        key={editPatient?.id}
        open={!!editPatient}
        onClose={() => setEditPatient(null)}
        onSubmit={(d) => editMutation.mutate(d)}
        loading={editMutation.isPending}
        initial={editPatient}
        mode="edit"
      />
    </div>
  );
}