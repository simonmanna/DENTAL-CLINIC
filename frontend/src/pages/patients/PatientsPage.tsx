// src/pages/patients/PatientsPage.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { notify } from "@/lib/notify";
import { patientsApi } from "../../lib/api/patients";
import { visitsApi } from "../../lib/api";
import { staffApi } from "../../lib/api/staff-api";
import { useAuthStore } from "../../store/auth.store";
import type { Patient } from "@/types/patients";
import type { Dentist } from "@/types/staff";

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
import { ActionButton, RowActions } from "@/components/ui/action-button";

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
  /* Fonts come from the app shell (self-hosted Geist). A runtime @import of a
     web font here was discovered only after the route rendered, so cold loads
     painted with a fallback face and then reflowed the whole table. */
  .pts-root {
    --clr-bg:        hsl(var(--background));
    --clr-surface:   hsl(var(--card));
    --clr-subtle:    hsl(var(--muted) / .55);
    --clr-primary:   hsl(var(--primary));
    --clr-primary-fg:hsl(var(--primary-foreground));
    --clr-primary-l: hsl(var(--primary-muted));
    --clr-success:   hsl(var(--success));
    --clr-danger:    hsl(var(--danger));
    --clr-text:      hsl(var(--foreground));
    --clr-muted:     hsl(var(--muted-foreground));
    --clr-faint:     hsl(var(--muted-foreground) / .55);
    --clr-border:    hsl(var(--border));
    --clr-input:     hsl(var(--input));
    --clr-row-hover: hsl(var(--primary-muted) / .45);
    --pts-radius:    10px;
    --shadow-sm:     0 1px 2px hsl(215 28% 17% / .05);
    --shadow-lg:     0 24px 64px hsl(215 28% 10% / .22), 0 8px 24px hsl(215 28% 10% / .10);
    min-height: 100%;
    padding: 12px 8px 24px;
    color: var(--clr-text);
  }
  @media (min-width: 768px) { .pts-root { padding: 16px 16px 32px; } }

  /* ── Header ── */
  .pts-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-bottom: 14px;
    flex-wrap: wrap;
    gap: 12px;
  }
  .pts-header-left h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--clr-text);
    letter-spacing: -.02em;
    line-height: 1.15;
  }
  .pts-header-left p {
    margin-top: 2px;
    font-size: .85rem;
    color: var(--clr-muted);
    min-height: 1.25em;
  }
  .pts-header-actions { display: flex; gap: 8px; }

  /* ── Card / table wrapper ── */
  .pts-card {
    background: var(--clr-surface);
    border-radius: var(--pts-radius);
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--clr-border);
    overflow: hidden;
  }

  /* ── Toolbar ── */
  .pts-toolbar {
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--clr-border);
    flex-wrap: wrap;
  }
  .pts-search-wrap {
    position: relative;
    flex: 1 1 240px;
    max-width: 360px;
  }
  .pts-search-wrap > svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--clr-muted); pointer-events: none; }
  .pts-search-wrap input {
    width: 100%;
    height: 36px;
    padding: 0 32px 0 34px;
    border: 1px solid var(--clr-input);
    border-radius: 8px;
    font-size: .875rem;
    font-family: inherit;
    color: var(--clr-text);
    background: var(--clr-surface);
    outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .pts-search-wrap input::-webkit-search-cancel-button { display: none; }
  .pts-search-clear {
    position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    border: none; background: transparent; border-radius: 6px;
    color: var(--clr-muted); cursor: pointer;
  }
  .pts-search-clear:hover { background: var(--clr-subtle); color: var(--clr-text); }

  .pts-select {
    height: 36px;
    padding: 0 30px 0 12px;
    border: 1px solid var(--clr-input);
    border-radius: 8px;
    font-size: .875rem;
    font-family: inherit;
    color: var(--clr-text);
    background: var(--clr-surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 10px center;
    appearance: none;
    outline: none;
    cursor: pointer;
    transition: border-color .15s, box-shadow .15s;
  }

  .pts-daterange {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 8px 0 10px;
    border: 1px solid var(--clr-input);
    border-radius: 8px;
    background: var(--clr-surface);
    color: var(--clr-muted);
    transition: border-color .15s, box-shadow .15s;
  }
  .pts-daterange input {
    border: none;
    outline: none;
    font-size: .8rem;
    font-family: inherit;
    color: var(--clr-text);
    background: transparent;
    width: 118px;
    color-scheme: light dark;
  }
  .pts-daterange-clear {
    border: none; background: transparent; cursor: pointer;
    color: var(--clr-muted); display: flex; align-items: center;
    padding: 3px; border-radius: 5px;
  }
  .pts-daterange-clear:hover { background: var(--clr-subtle); color: var(--clr-text); }

  .pts-search-wrap input:focus-visible,
  .pts-select:focus-visible,
  .pts-daterange:focus-within,
  .pts-input:focus-visible,
  .pts-input-select:focus-visible {
    border-color: var(--clr-primary);
    box-shadow: 0 0 0 3px hsl(var(--ring) / .18);
  }
  .pts-search-wrap input::placeholder, .pts-input::placeholder { color: var(--clr-faint); }

  .pts-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    height: 36px;
    padding: 0 14px;
    border-radius: 8px;
    font-size: .875rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background-color .15s, border-color .15s, color .15s, box-shadow .15s;
    white-space: nowrap;
  }
  .pts-btn:focus-visible { outline: 2px solid var(--clr-primary); outline-offset: 2px; }
  .pts-btn:disabled { opacity: .6; cursor: not-allowed; }
  .pts-btn-primary { background: var(--clr-primary); color: var(--clr-primary-fg); box-shadow: var(--shadow-sm); }
  .pts-btn-primary:hover:not(:disabled) { background: hsl(var(--primary) / .9); }
  .pts-btn-outline { background: var(--clr-surface); color: var(--clr-text); border-color: var(--clr-input); }
  .pts-btn-outline:hover:not(:disabled) { border-color: var(--clr-primary); color: var(--clr-primary); background: var(--clr-primary-l); }
  .pts-btn .pts-spin-icon { animation: pts-spin .8s linear infinite; }

  .pts-toolbar-right { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .pts-count-badge {
    color: var(--clr-muted);
    font-size: .8rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .pts-count-badge strong { color: var(--clr-text); font-weight: 600; }

  /* ── Data table ──
     Fixed layout + <colgroup> widths: columns never resize as rows, fonts or
     pages change, so first paint, skeleton and data all share one geometry. */
  .pts-table-wrap { overflow-x: auto; position: relative; }
  .pts-table {
    width: 100%;
    min-width: 1090px;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: .875rem;
  }
  .pts-table thead th {
    position: sticky; top: 0;
    background: var(--clr-subtle);
    border-bottom: 1px solid var(--clr-border);
    padding: 10px 14px;
    text-align: left;
    font-size: .7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--clr-muted);
    white-space: nowrap;
  }
  .pts-table tbody { transition: opacity .15s; }
  .pts-table tbody.is-fetching { opacity: .55; }
  .pts-table tbody tr {
    border-bottom: 1px solid var(--clr-border);
    transition: background-color .12s;
    cursor: pointer;
  }
  .pts-table tbody tr:last-child { border-bottom: none; }
  .pts-table tbody tr:hover { background: var(--clr-row-hover); }
  .pts-table tbody tr:focus-visible { outline: 2px solid var(--clr-primary); outline-offset: -2px; background: var(--clr-row-hover); }
  .pts-table td {
    padding: 10px 14px;
    height: 58px;
    vertical-align: middle;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pts-cell-index { color: var(--clr-faint); font-size: .78rem; font-weight: 500; }
  .pts-cell-stack { display: flex; flex-direction: column; gap: 1px; min-width: 0; line-height: 1.3; }
  .pts-cell-primary { font-size: .82rem; font-weight: 500; color: var(--clr-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pts-cell-secondary { font-size: .72rem; color: var(--clr-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pts-dash { color: var(--clr-faint); }

  /* ── Avatar ── */
  .pts-patient { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .pts-avatar {
    width: 36px; height: 36px;
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    font-size: .78rem;
    font-weight: 600;
    flex-shrink: 0;
    text-transform: uppercase;
  }
  .pts-avatar-blue   { background: hsl(var(--info-muted));    color: hsl(var(--info)); }
  .pts-avatar-pink   { background: hsl(330 80% 95%);          color: hsl(330 60% 42%); }
  .pts-avatar-green  { background: hsl(var(--success-muted)); color: hsl(var(--success)); }
  .pts-avatar-purple { background: hsl(265 80% 96%);          color: hsl(265 50% 50%); }
  .pts-avatar-amber  { background: hsl(var(--warning-muted)); color: hsl(var(--warning)); }
  .dark .pts-avatar-pink   { background: hsl(330 40% 18%); color: hsl(330 80% 76%); }
  .dark .pts-avatar-purple { background: hsl(265 35% 20%); color: hsl(265 80% 80%); }

  .pts-patient-name { font-weight: 600; color: var(--clr-text); line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pts-patient-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .7rem; color: var(--clr-muted); margin-top: 1px; }

  /* ── Badges ── */
  .pts-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: .72rem;
    font-weight: 600;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .pts-badge-male   { background: hsl(var(--info-muted)); color: hsl(var(--info)); }
  .pts-badge-female { background: hsl(330 80% 95%); color: hsl(330 60% 42%); }
  .dark .pts-badge-female { background: hsl(330 40% 18%); color: hsl(330 80% 76%); }
  .pts-badge-other  { background: hsl(var(--muted)); color: var(--clr-muted); }
  .pts-badge-appt   { background: var(--clr-primary-l); color: hsl(var(--accent-foreground)); }
  .pts-badge-zero   { background: transparent; color: var(--clr-faint); padding-left: 0; }
  .pts-card-no {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: .75rem;
    color: var(--clr-text);
    background: hsl(var(--muted));
    padding: 2px 7px;
    border-radius: 5px;
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
  }

  /* ── Row actions ── */
  .pts-row-actions { display: flex; gap: 4px; justify-content: flex-end; }
  .pts-action-btn {
    width: 30px; height: 30px;
    border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    border: 1px solid transparent;
    background: transparent;
    color: var(--clr-muted);
    transition: background-color .12s, color .12s, border-color .12s;
    flex-shrink: 0;
  }
  .pts-action-btn:hover { background: var(--clr-surface); border-color: var(--clr-border); color: var(--clr-primary); }
  .pts-action-btn:focus-visible { outline: 2px solid var(--clr-primary); outline-offset: 1px; }

  /* ── Skeleton ── */
  .pts-skel {
    display: block;
    height: 10px;
    border-radius: 5px;
    background: linear-gradient(90deg, hsl(var(--muted)) 0%, hsl(var(--muted) / .45) 50%, hsl(var(--muted)) 100%);
    background-size: 200% 100%;
    animation: pts-shimmer 1.2s ease-in-out infinite;
  }
  .pts-skel-avatar { width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0; }
  @keyframes pts-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
  .pts-table tbody tr.pts-skel-row { cursor: default; }
  .pts-table tbody tr.pts-skel-row:hover { background: transparent; }

  /* ── Pagination ── */
  .pts-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-top: 1px solid var(--clr-border);
    flex-wrap: wrap;
    gap: 10px;
  }
  .pts-pager-info { font-size: .8rem; color: var(--clr-muted); font-variant-numeric: tabular-nums; }
  .pts-pager-info strong { color: var(--clr-text); font-weight: 600; }
  .pts-pager-btns { display: flex; gap: 4px; }
  .pts-page-btn {
    min-width: 32px; height: 32px;
    padding: 0 6px;
    border-radius: 7px;
    border: 1px solid var(--clr-border);
    background: var(--clr-surface);
    color: var(--clr-text);
    font-size: .8rem;
    font-weight: 500;
    font-family: inherit;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background-color .12s, border-color .12s, color .12s;
  }
  .pts-page-btn:hover:not(:disabled):not(.active) { border-color: var(--clr-primary); color: var(--clr-primary); background: var(--clr-primary-l); }
  .pts-page-btn:focus-visible { outline: 2px solid var(--clr-primary); outline-offset: 1px; }
  .pts-page-btn.active { background: var(--clr-primary); color: var(--clr-primary-fg); border-color: var(--clr-primary); }
  .pts-page-btn:disabled { opacity: .4; cursor: default; }
  .pts-page-gap { min-width: 24px; height: 32px; display: flex; align-items: center; justify-content: center; color: var(--clr-muted); }

  /* ── Modal overlay ── */
  .pts-overlay {
    position: fixed; inset: 0;
    background: hsl(215 30% 8% / .5);
    backdrop-filter: blur(3px);
    z-index: 50;
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    animation: pts-fade-in .15s ease-out;
  }
  @keyframes pts-fade-in { from { opacity: 0; } to { opacity: 1; } }

  .pts-modal {
    background: var(--clr-surface);
    color: var(--clr-text);
    border: 1px solid var(--clr-border);
    border-radius: 14px;
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 760px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: pts-rise .2s cubic-bezier(.2,.8,.2,1);
  }
  @keyframes pts-rise { from { transform: translateY(12px) scale(.985); opacity: 0; } to { transform: none; opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    .pts-overlay, .pts-modal, .pts-skel, .pts-btn .pts-spin-icon { animation: none; }
  }

  .pts-modal-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--clr-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .pts-modal-header h2 {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--clr-text);
    display: flex; align-items: center; gap: 10px;
  }
  .pts-modal-header h2 .icon-wrap {
    width: 34px; height: 34px;
    background: var(--clr-primary-l);
    color: var(--clr-primary);
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
  }
  .pts-modal-close {
    width: 32px; height: 32px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: var(--clr-muted);
    transition: background-color .12s, color .12s;
  }
  .pts-modal-close:hover { background: var(--clr-subtle); color: var(--clr-text); }
  .pts-modal-close:focus-visible { outline: 2px solid var(--clr-primary); outline-offset: 1px; }

  .pts-modal-body {
    overflow-y: auto;
    padding: 20px;
    flex: 1;
  }
  .pts-modal-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--clr-border);
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    flex-shrink: 0;
    background: var(--clr-subtle);
  }

  /* ── Form sections ── */
  .pts-form-section { margin-bottom: 20px; }
  .pts-form-section:last-child { margin-bottom: 0; }
  .pts-section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .pts-section-label .num {
    width: 20px; height: 20px;
    background: var(--clr-primary-l);
    color: var(--clr-primary);
    border-radius: 6px;
    font-size: .7rem;
    font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }
  .pts-section-label span:not(.num) {
    font-size: .75rem;
    font-weight: 600;
    color: var(--clr-muted);
    text-transform: uppercase;
    letter-spacing: .06em;
  }
  .pts-section-label::after { content: ''; flex: 1; height: 1px; background: var(--clr-border); }

  .pts-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .pts-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  @media (max-width: 600px) { .pts-grid-2, .pts-grid-3 { grid-template-columns: 1fr; } }

  .pts-field { display: flex; flex-direction: column; gap: 5px; }
  .pts-field label {
    font-size: .78rem;
    font-weight: 600;
    color: var(--clr-text);
  }
  .pts-field label .req { color: var(--clr-danger); margin-left: 2px; }
  .pts-field .hint { font-size: .72rem; color: var(--clr-muted); }
  .pts-field .error { font-size: .72rem; color: var(--clr-danger); }

  .pts-input, .pts-input-select {
    height: 38px;
    padding: 0 12px;
    border: 1px solid var(--clr-input);
    border-radius: 8px;
    font-size: .875rem;
    font-family: inherit;
    color: var(--clr-text);
    background-color: var(--clr-surface);
    outline: none;
    transition: border-color .15s, box-shadow .15s;
    width: 100%;
    box-sizing: border-box;
  }
  .pts-input-select {
    padding-right: 32px;
    background: var(--clr-surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 10px center;
    appearance: none;
    cursor: pointer;
  }
  .pts-input-error, .pts-input-error:focus-visible { border-color: var(--clr-danger) !important; box-shadow: 0 0 0 3px hsl(var(--danger) / .12) !important; }

  /* ── Empty state ── */
  .pts-empty {
    padding: 56px 24px;
    text-align: center;
  }
  .pts-empty .icon-ring {
    width: 56px; height: 56px;
    background: var(--clr-primary-l);
    border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 14px;
    color: var(--clr-primary);
  }
  .pts-empty h3 { font-size: 1rem; font-weight: 600; color: var(--clr-text); }
  .pts-empty p  { font-size: .875rem; color: var(--clr-muted); margin-top: 4px; }
  .pts-empty-actions { display: flex; justify-content: center; gap: 8px; margin-top: 16px; }

  @keyframes pts-spin { to { transform: rotate(360deg); } }
  .pts-spinner {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: pts-spin .7s linear infinite;
  }

  /* ── misc ── */
  .pts-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .pts-contact-line { display: flex; align-items: center; gap: 6px; color: var(--clr-text); font-size: .82rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .pts-contact-line svg { color: var(--clr-faint); flex-shrink: 0; }
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
          aria-label="Previous page"
          onClick={() => onChange(page - 1)}
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={i} className="pts-page-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={i}
              className={`pts-page-btn${page === p ? " active" : ""}`}
              aria-current={page === p ? "page" : undefined}
              aria-label={`Page ${p}`}
              onClick={() => onChange(p as number)}
            >
              {p}
            </button>
          ),
        )}
        <button
          className="pts-page-btn"
          disabled={page === totalPages}
          aria-label="Next page"
          onClick={() => onChange(page + 1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}

/* ─── Form Modal (shared for Add + Edit) ───────────────────────────────────── */
type WalkInVisit = { dentistId: string; chiefComplaint: string };

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
  dentists = [],
  defaultDentistId,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any, visit?: WalkInVisit) => void;
  loading: boolean;
  initial?: any;
  mode: "add" | "edit";
  dentists?: Dentist[];
  defaultDentistId?: string;
}) {
  // Add mode only: who sees the patient if they go straight to a visit.
  const [visit, setVisit] = useState<WalkInVisit>({
    dentistId: "",
    chiefComplaint: "",
  });
  const [dentistError, setDentistError] = useState<string>();
  const [submitted, setSubmitted] = useState<"patient" | "visit">("patient");

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
      setVisit({ dentistId: defaultDentistId ?? "", chiefComplaint: "" });
      setDentistError(undefined);
    }
  }, [open, initial, defaultDentistId]);

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
      setSubmitted("patient");
      onSubmit(form);
    }
  };

  const handleSubmitWithVisit = () => {
    const formOk = validate();
    const dentistOk = !!visit.dentistId;
    setDentistError(dentistOk ? undefined : "Choose the dentist for the visit");
    if (formOk && dentistOk) {
      setSubmitted("visit");
      onSubmit(form, visit);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="pts-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="pts-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pts-modal-title"
      >
        <div className="pts-modal-header">
          <h2 id="pts-modal-title">
            <span className="icon-wrap">
              {mode === "add" ? <UserPlus size={16} /> : <Edit2 size={16} />}
            </span>
            {mode === "add" ? "Register New Patient" : "Edit Patient Record"}
          </h2>
          <button
            className="pts-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
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

          {mode === "add" && (
            <div className="pts-form-section">
              <div className="pts-section-label">
                <span className="num">4</span>
                <span>Visit Now (for Register Patient and Visit)</span>
              </div>
              <div className="pts-grid-2">
                <Field label="Dentist" error={dentistError}>
                  <select
                    className={`pts-input-select ${dentistError ? "pts-input-error" : ""}`}
                    value={visit.dentistId}
                    onChange={(e) => {
                      setVisit((v) => ({ ...v, dentistId: e.target.value }));
                      setDentistError(undefined);
                    }}
                  >
                    <option value="">Select dentist</option>
                    {dentists.map((d) => (
                      <option key={d.id} value={d.id}>
                        Dr. {d.firstName} {d.lastName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Chief Complaint">
                  <input
                    className="pts-input"
                    value={visit.chiefComplaint}
                    onChange={(e) =>
                      setVisit((v) => ({
                        ...v,
                        chiefComplaint: e.target.value,
                      }))
                    }
                    placeholder="e.g. Toothache, lower left"
                  />
                </Field>
              </div>
            </div>
          )}
        </div>

        <div className="pts-modal-footer">
          <button
            className="pts-btn pts-btn-outline"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          {mode === "add" && (
            <button
              className="pts-btn pts-btn-outline"
              onClick={handleSubmitWithVisit}
              disabled={loading}
            >
              {loading && submitted === "visit" ? (
                <>
                  <span className="pts-spinner" />
                  Opening visit…
                </>
              ) : (
                <>
                  <Stethoscope size={15} />
                  Register Patient and Visit
                </>
              )}
            </button>
          )}
          <button
            className="pts-btn pts-btn-primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading && submitted === "patient" ? (
              <>
                <span className="pts-spinner" />
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
const patientName = (p: any) =>
  [p?.firstName, p?.lastName].filter(Boolean).join(" ") || "Patient";

const apiMessage = (e: any): string | undefined => {
  const msg = e?.response?.data?.message;
  if (!msg) return undefined;
  return Array.isArray(msg) ? msg.join(" • ") : String(msg);
};

// Yellow for problems the user can fix (bad input, duplicates), red for
// everything else (server down, permissions, unexpected failures).
const notifySaveError = (error: any, action: "create" | "update") => {
  const status = error?.response?.status;
  const msg = apiMessage(error);
  const verb = action === "create" ? "register" : "update";
  if (status === 400 || status === 422) {
    notify.warning("Please check the patient details", msg || "Some fields are invalid.");
  } else if (status === 409) {
    notify.warning("Patient already exists", msg || "A patient with these details is already registered.");
  } else if (!error?.response) {
    notify.error(`Could not ${verb} patient`, "Cannot reach the server. Check your connection and try again.");
  } else if (status === 401 || status === 403) {
    notify.error(`Could not ${verb} patient`, msg || "You don't have permission to do this.");
  } else {
    notify.error(`Could not ${verb} patient`, msg || "Something went wrong. Please try again.");
  }
};

export function PatientsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [genderFilter, setGender] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editPatient, setEditPatient] = useState<any>(null);

  // Debounce the search box so each keystroke doesn't fire a request (and
  // re-render the table mid-typing).
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  const {
    data: patientsResp,
    isLoading,
    isFetching,
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

  const { user } = useAuthStore();
  const { data: dentists = [] } = useQuery({
    queryKey: ["dentists"],
    queryFn: staffApi.getDentists,
  });
  // A dentist registering a walk-in is usually the one seeing them; with a
  // single dentist on staff there is nothing to choose.
  const defaultDentistId =
    dentists.find((d) => d.id === user?.staff?.id)?.id ??
    (dentists.length === 1 ? dentists[0].id : undefined);

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
    mutationFn: async ({ d, visit }: { d: any; visit?: WalkInVisit }) => {
      const patient = await patientsApi.create(preparePayload(d));
      if (!visit) return { patient };
      try {
        const created = await visitsApi.createWalkIn({
          patientId: patient.id,
          dentistId: visit.dentistId,
          chiefComplaint: visit.chiefComplaint.trim() || undefined,
        });
        return { patient, visit: created };
      } catch (e: any) {
        // The patient is saved; only the visit failed. Say so and fall back
        // to the patient's page rather than leaving the dialog half-done.
        return { patient, visitFailed: true, visitError: apiMessage(e) };
      }
    },
    onSuccess: ({ patient, visit, visitFailed, visitError }: any) => {
      refetch();
      qc.invalidateQueries({ queryKey: ["patient-stats"] });
      setShowAdd(false);
      const name = patientName(patient);
      if (visit) {
        notify.success("Patient registered", `${name} was added and a visit was opened.`);
        qc.invalidateQueries({ queryKey: ["appointments"] });
        qc.invalidateQueries({ queryKey: ["visits"] });
        navigate(`/visits/${visit.id}`);
      } else if (visitFailed) {
        notify.warning(
          "Patient registered, but the visit could not be opened",
          visitError || `${name} was saved. Open a visit from their page.`,
        );
        navigate(`/patients/${patient.id}`);
      } else {
        notify.success("Patient registered", `${name} was added successfully.`);
      }
    },
    onError: (error: any) => notifySaveError(error, "create"),
  });

  const editMutation = useMutation({
    mutationFn: (d: any) =>
      patientsApi.update(
        editPatient.id,
        preparePayload(d, editPatient.dateOfBirth), // ← Pass original DOB for edit
      ),
    onSuccess: (updated: any) => {
      refetch();
      qc.invalidateQueries({ queryKey: ["patient-stats"] });
      notify.success("Patient updated", `${patientName(updated?.firstName ? updated : editPatient)}'s details were saved.`);
      setEditPatient(null);
    },
    onError: (error: any) => notifySaveError(error, "update"),
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

  const hasFilters = !!(search || genderFilter || dateFrom || dateTo);
  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setGender("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  return (
    <div className="pts-root">
      <style>{STYLES}</style>

      {/* ── Header ── */}
      <div className="pts-header">
        <div className="pts-header-left">
          <h1>Patients</h1>
          <p>
            {isLoading
              ? " "
              : `${meta.total.toLocaleString()} ${hasFilters ? "matching" : "registered"} patient${meta.total === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="pts-header-actions">
          <button
            className="pts-btn pts-btn-outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["patients"] })}
            disabled={isFetching}
          >
            <RefreshCw
              size={14}
              className={isFetching ? "pts-spin-icon" : undefined}
            />
            Refresh
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
            <Search size={15} />
            <input
              type="search"
              aria-label="Search patients"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, code, phone…"
            />
            {searchInput && (
              <button
                type="button"
                className="pts-search-clear"
                aria-label="Clear search"
                onClick={() => setSearchInput("")}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <select
            className="pts-select"
            aria-label="Filter by gender"
            value={genderFilter}
            onChange={(e) => {
              setGender(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All genders</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>

          {/* ── Registered date range filter ─────────────────────────────── */}
          <div className="pts-daterange" title="Filter by registration date">
            <Calendar size={14} />
            <input
              type="date"
              aria-label="Registered from"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
            />
            <span aria-hidden="true">→</span>
            <input
              type="date"
              aria-label="Registered to"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                className="pts-daterange-clear"
                aria-label="Clear date filter"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="pts-toolbar-right">
            {hasFilters && (
              <button
                type="button"
                className="pts-btn pts-btn-outline"
                onClick={clearFilters}
              >
                <X size={14} /> Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Table — the skeleton reuses the real <colgroup>, so swapping
            loading → data never shifts a column. */}
        {!isLoading && patients.length === 0 ? (
          <div className="pts-empty">
            <div className="icon-ring">
              <Users size={26} />
            </div>
            <h3>{hasFilters ? "No matching patients" : "No patients yet"}</h3>
            <p>
              {search
                ? `Nothing matches "${search}". Check the spelling or try a phone number.`
                : hasFilters
                  ? "No patients match the current filters."
                  : "Register your first patient to get started."}
            </p>
            <div className="pts-empty-actions">
              {hasFilters ? (
                <button
                  className="pts-btn pts-btn-outline"
                  onClick={clearFilters}
                >
                  <X size={14} /> Clear filters
                </button>
              ) : (
                <button
                  className="pts-btn pts-btn-primary"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus size={14} /> Add Patient
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="pts-table-wrap scrollbar-slim">
              <table className="pts-table" aria-busy={isFetching}>
                <colgroup>
                  <col style={{ width: 52 }} />
                  <col />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 116 }} />
                  <col style={{ width: 112 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 88 }} />
                  <col style={{ width: 80 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Patient</th>
                    <th scope="col">Phone</th>
                    <th scope="col">Gender</th>
                    <th scope="col">Age</th>
                    <th scope="col">Registered</th>
                    <th scope="col">Card No.</th>
                    <th scope="col">Visits</th>
                    <th scope="col" style={{ textAlign: "right" }}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>

                {isLoading ? (
                  <tbody aria-hidden="true">
                    {Array.from({ length: 8 }, (_, i) => (
                      <tr key={i} className="pts-skel-row">
                        <td>
                          <span className="pts-skel" style={{ width: 16 }} />
                        </td>
                        <td>
                          <div className="pts-patient">
                            <span className="pts-skel pts-skel-avatar" />
                            <div className="pts-cell-stack" style={{ gap: 6, flex: 1 }}>
                              <span className="pts-skel" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
                              <span className="pts-skel" style={{ width: 70, height: 8 }} />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="pts-skel" style={{ width: 96 }} />
                        </td>
                        <td>
                          <span className="pts-skel" style={{ width: 48, height: 18, borderRadius: 999 }} />
                        </td>
                        <td>
                          <span className="pts-skel" style={{ width: 52 }} />
                        </td>
                        <td>
                          <span className="pts-skel" style={{ width: 72 }} />
                        </td>
                        <td>
                          <span className="pts-skel" style={{ width: 80 }} />
                        </td>
                        <td>
                          <span className="pts-skel" style={{ width: 56, height: 18, borderRadius: 999 }} />
                        </td>
                        <td />
                      </tr>
                    ))}
                  </tbody>
                ) : (
                  <tbody className={isFetching ? "is-fetching" : undefined}>
                    {patients.map((p: any, i: number) => {
                      const color = avatarColor(`${p.firstName}${p.lastName}`);
                      const genderLabel =
                        p.gender === "MALE"
                          ? "Male"
                          : p.gender === "FEMALE"
                            ? "Female"
                            : "Other";
                      const genderClass =
                        p.gender === "MALE"
                          ? "pts-badge-male"
                          : p.gender === "FEMALE"
                            ? "pts-badge-female"
                            : "pts-badge-other";
                      const fullName = [p.firstName, p.lastName]
                        .filter(Boolean)
                        .join(" ");
                      const registered = p.registeredAt || p.createdAt;
                      const visits = p._count?.appointments || 0;
                      const open = () => navigate(`/patients/${p.id}`);
                      return (
                        <tr
                          key={p.id}
                          tabIndex={0}
                          aria-label={`Open ${fullName}`}
                          onClick={open}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              open();
                            }
                          }}
                        >
                          <td className="pts-cell-index">
                            {(page - 1) * 15 + i + 1}
                          </td>
                          <td>
                            <div className="pts-patient">
                              <div className={`pts-avatar pts-avatar-${color}`}>
                                {p.firstName?.[0]}
                                {p.lastName?.[0]}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div className="pts-patient-name" title={fullName}>
                                  {fullName}
                                </div>
                                <div className="pts-patient-code">
                                  {p.patientCode}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            {p.phone ? (
                              <div className="pts-contact-line">
                                <Phone size={12} />
                                {p.phone}
                              </div>
                            ) : (
                              <span className="pts-dash">—</span>
                            )}
                          </td>
                          <td>
                            {p.gender ? (
                              <span className={`pts-badge ${genderClass}`}>
                                {genderLabel}
                              </span>
                            ) : (
                              <span className="pts-dash">—</span>
                            )}
                          </td>
                          <td>
                            {p.dateOfBirth ? (
                              <div className="pts-cell-stack">
                                <span className="pts-cell-primary">
                                  {getAge(p.dateOfBirth)} yrs
                                </span>
                                <span className="pts-cell-secondary">
                                  Born {formatDate(p.dateOfBirth)}
                                </span>
                              </div>
                            ) : (
                              <span className="pts-dash">—</span>
                            )}
                          </td>
                          <td title={registered ? new Date(registered).toLocaleString() : ""}>
                            {registered ? (
                              <div className="pts-cell-stack">
                                <span className="pts-cell-primary">
                                  {formatDate(registered)}
                                </span>
                                <span className="pts-cell-secondary">
                                  {new Date(registered).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                            ) : (
                              <span className="pts-dash">—</span>
                            )}
                          </td>
                          <td>
                            {p.previousCardNumber ? (
                              <span className="pts-card-no" title={p.previousCardNumber}>
                                {p.previousCardNumber}
                              </span>
                            ) : (
                              <span className="pts-dash">—</span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`pts-badge ${visits ? "pts-badge-appt" : "pts-badge-zero"}`}
                            >
                              {visits} {visits === 1 ? "visit" : "visits"}
                            </span>
                          </td>
                          <td>
                            <RowActions>
                              <ActionButton iconOnly tone="view" label={`View ${fullName}`} onClick={open} />
                              <ActionButton iconOnly tone="edit" label={`Edit ${fullName}`} onClick={() => setEditPatient(p)} />
                            </RowActions>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                )}
              </table>
            </div>

            {!isLoading && (
              <PtsPageinator
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

      {/* ── Add Modal ── */}
      <PatientFormModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={(d, visit) => addMutation.mutate({ d, visit })}
        loading={addMutation.isPending}
        mode="add"
        dentists={dentists}
        defaultDentistId={defaultDentistId}
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
