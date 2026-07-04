// src/pages/NotificationsPage.tsx

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Search,
  Filter,
  Check,
  CheckCheck,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertTriangle,
  Info,
  XCircle,
  CheckCircle2,
  RefreshCw,
  X,
} from 'lucide-react';
import { useNotifications, Notification, NotificationQueryParams } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'ALL', label: 'All', emoji: '📋' },
  { key: 'APPOINTMENT', label: 'Appointments', emoji: '📅' },
  { key: 'CLINICAL', label: 'Clinical', emoji: '🩺' },
  { key: 'BILLING', label: 'Billing', emoji: '💳' },
  { key: 'INVENTORY', label: 'Inventory', emoji: '📦' },
  { key: 'SYSTEM', label: 'System', emoji: '⚙️' },
  { key: 'ADMIN', label: 'Admin', emoji: '🔧' },
];

const PRIORITIES = [
  { key: 'ALL', label: 'All Priorities' },
  { key: 'URGENT', label: 'Urgent', color: '#ef4444' },
  { key: 'HIGH', label: 'High', color: '#f59e0b' },
  { key: 'MEDIUM', label: 'Medium', color: '#3b82f6' },
  { key: 'LOW', label: 'Low', color: '#94a3b8' },
];

const READ_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'UNREAD', label: 'Unread' },
  { key: 'READ', label: 'Read' },
];

const priorityBorder: Record<string, string> = {
  LOW: '#e2e8f0',
  MEDIUM: '#93c5fd',
  HIGH: '#fcd34d',
  URGENT: '#fca5a5',
};

const typeIcon: Record<string, typeof Info> = {
  INFO: Info,
  WARNING: AlertTriangle,
  ERROR: XCircle,
  SUCCESS: CheckCircle2,
};

const typeColors: Record<string, { bg: string; text: string; border: string }> = {
  INFO: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  WARNING: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  ERROR: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  SUCCESS: { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
};

const categoryLabel: Record<string, { label: string; emoji: string }> = {
  APPOINTMENT: { label: 'Appointment', emoji: '📅' },
  CLINICAL: { label: 'Clinical', emoji: '🩺' },
  BILLING: { label: 'Billing', emoji: '💳' },
  INVENTORY: { label: 'Inventory', emoji: '📦' },
  SYSTEM: { label: 'System', emoji: '⚙️' },
  ADMIN: { label: 'Admin', emoji: '🔧' },
};

// ─── Time formatter ───────────────────────────────────────────────────────────

function formatTimestamp(dateStr: string): { relative: string; full: string } {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  let relative: string;
  if (diff < 60) relative = 'Just now';
  else if (diff < 3600) relative = `${Math.floor(diff / 60)}m ago`;
  else if (diff < 86400) relative = `${Math.floor(diff / 3600)}h ago`;
  else if (diff < 604800) relative = `${Math.floor(diff / 86400)}d ago`;
  else relative = date.toLocaleDateString('en-UG', { month: 'short', day: 'numeric' });

  const full = date.toLocaleString('en-UG', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return { relative, full };
}

// ─── Notification Row ─────────────────────────────────────────────────────────

function NotificationRow({
  notification,
  onRead,
  onDelete,
  onNavigate,
  selected,
  onSelect,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (url: string) => void;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const cat = categoryLabel[notification.category] || { label: 'System', emoji: '⚙️' };
  const colors = typeColors[notification.type] || typeColors.INFO;
  const TypeIcon = typeIcon[notification.type] || Info;
  const time = formatTimestamp(notification.createdAt);

  return (
    <div
      className={cn(
        'group flex items-start gap-3 px-5 py-4 transition-all duration-150 cursor-pointer',
        notification.isRead ? 'bg-white' : 'bg-blue-50/30',
        selected && 'bg-blue-50/60',
      )}
      style={{
        borderBottom: '1px solid #f1f5f9',
        borderLeft: `3px solid ${priorityBorder[notification.priority] || '#e2e8f0'}`,
      }}
      onClick={() => {
        if (!notification.isRead) onRead(notification.id);
        if (notification.actionUrl) onNavigate(notification.actionUrl);
      }}
    >
      {/* Checkbox */}
      <div className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(notification.id)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
      </div>

      {/* Type icon */}
      <div
        className="shrink-0 flex items-center justify-center rounded-lg"
        style={{
          width: 36,
          height: 36,
          background: colors.bg,
          border: `1px solid ${colors.border}`,
        }}
      >
        <TypeIcon style={{ width: 16, height: 16, color: colors.text }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className="text-[13.5px] leading-snug"
              style={{
                color: '#1e293b',
                fontWeight: notification.isRead ? 400 : 600,
              }}
            >
              {notification.title}
            </p>
            <p
              className="text-[12.5px] mt-1 line-clamp-2"
              style={{ color: '#64748b', lineHeight: 1.5 }}
            >
              {notification.message}
            </p>
          </div>

          {/* Time + actions */}
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <span
              className="text-[11px] whitespace-nowrap"
              style={{ color: '#94a3b8' }}
              title={time.full}
            >
              {time.relative}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!notification.isRead && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRead(notification.id);
                  }}
                  className="p-1 rounded-md hover:bg-blue-50 transition-colors"
                  title="Mark as read"
                >
                  <Check style={{ width: 13, height: 13, color: '#3b82f6' }} />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(notification.id);
                }}
                className="p-1 rounded-md hover:bg-red-50 transition-colors"
                title="Delete"
              >
                <Trash2 style={{ width: 13, height: 13, color: '#ef4444' }} />
              </button>
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full"
            style={{ background: colors.bg, color: colors.text, fontWeight: 500 }}
          >
            {cat.emoji} {cat.label}
          </span>
          <span
            className="text-[10.5px] px-2 py-0.5 rounded-full"
            style={{
              background: notification.priority === 'URGENT' ? '#fef2f2' : notification.priority === 'HIGH' ? '#fffbeb' : '#f8fafc',
              color: notification.priority === 'URGENT' ? '#dc2626' : notification.priority === 'HIGH' ? '#d97706' : '#64748b',
              fontWeight: 500,
            }}
          >
            {notification.priority}
          </span>
          {notification.actor?.staff && (
            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
              by {notification.actor.staff.firstName} {notification.actor.staff.lastName}
            </span>
          )}
          {notification.actionUrl && (
            <span style={{ fontSize: 10.5, color: '#3b82f6' }}>
              → {notification.actionUrl}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const navigate = useNavigate();
  const {
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchAll,
    fetchUnreadCount,
  } = useNotifications();

  // State
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [activePriority, setActivePriority] = useState('ALL');
  const [activeReadFilter, setActiveReadFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Build query params
  const buildParams = useCallback(
    (page = 1): NotificationQueryParams => {
      const params: NotificationQueryParams = { page, limit: 20 };
      if (activeCategory !== 'ALL') params.category = activeCategory;
      if (activePriority !== 'ALL') params.priority = activePriority;
      if (activeReadFilter === 'UNREAD') params.isRead = false;
      if (activeReadFilter === 'READ') params.isRead = true;
      if (searchQuery) params.search = searchQuery;
      return params;
    },
    [activeCategory, activePriority, activeReadFilter, searchQuery],
  );

  // Fetch notifications
  const loadNotifications = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const result = await fetchAll(buildParams(page));
        setNotifications(result.data || []);
        setMeta(result.meta || { total: 0, page: 1, limit: 20, totalPages: 0 });
      } catch (err) {
        console.error('Failed to load notifications:', err);
      } finally {
        setLoading(false);
      }
    },
    [fetchAll, buildParams],
  );

  // Initial load + filter changes
  useEffect(() => {
    loadNotifications(1);
    setSelectedIds(new Set());
  }, [activeCategory, activePriority, activeReadFilter, searchQuery]);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Selection handlers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === notifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notifications.map((n) => n.id)));
    }
  };

  // Bulk actions
  const bulkMarkRead = async () => {
    for (const id of selectedIds) {
      await markAsRead(id);
    }
    setSelectedIds(new Set());
    loadNotifications(meta.page);
  };

  const bulkDelete = async () => {
    for (const id of selectedIds) {
      await deleteNotification(id);
    }
    setSelectedIds(new Set());
    loadNotifications(meta.page);
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    loadNotifications(meta.page);
  };

  const handleNavigate = (url: string) => {
    navigate(url);
  };

  const handleRead = async (id: string) => {
    await markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)),
    );
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setMeta((prev) => ({ ...prev, total: prev.total - 1 }));
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{ width: 40, height: 40, background: '#eff6ff', border: '1px solid #bfdbfe' }}
          >
            <Bell style={{ width: 20, height: 20, color: '#2563eb' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Notifications
            </h1>
            <p style={{ fontSize: 12.5, color: '#64748b', margin: '2px 0 0' }}>
              {meta.total} total · {unreadCount} unread
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadNotifications(meta.page)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors hover:bg-gray-100"
            style={{ color: '#64748b', border: '1px solid #e2e8f0' }}
          >
            <RefreshCw style={{ width: 13, height: 13 }} />
            Refresh
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-white transition-colors hover:opacity-90"
              style={{ background: '#2563eb' }}
            >
              <CheckCheck style={{ width: 13, height: 13 }} />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div
        className="flex items-center gap-1 mb-4 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-semibold transition-all whitespace-nowrap',
              activeCategory === cat.key
                ? 'text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
            )}
            style={{
              background: activeCategory === cat.key ? '#eff6ff' : 'transparent',
              border: activeCategory === cat.key ? '1px solid #bfdbfe' : '1px solid transparent',
            }}
          >
            <span style={{ fontSize: 13 }}>{cat.emoji}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search + Filters Bar */}
      <div
        className="flex items-center gap-3 mb-4 flex-wrap"
      >
        {/* Search */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 min-w-[200px]"
          style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
        >
          <Search style={{ width: 14, height: 14, color: '#94a3b8', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search notifications..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="bg-transparent outline-none flex-1 min-w-0"
            style={{ fontSize: 13, color: '#334155' }}
          />
          {searchInput && (
            <button onClick={() => setSearchInput('')}>
              <X style={{ width: 13, height: 13, color: '#94a3b8' }} />
            </button>
          )}
        </div>

        {/* Toggle filters */}
        <button
          onClick={() => setShowFilters((o) => !o)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold transition-all',
            showFilters ? 'bg-blue-50 text-blue-700 border-blue-200' : 'text-gray-500 hover:bg-gray-50',
          )}
          style={{ border: `1px solid ${showFilters ? '#bfdbfe' : '#e2e8f0'}` }}
        >
          <Filter style={{ width: 13, height: 13 }} />
          Filters
          {(activePriority !== 'ALL' || activeReadFilter !== 'ALL') && (
            <span
              className="flex items-center justify-center rounded-full text-white"
              style={{ width: 16, height: 16, fontSize: 9, fontWeight: 700, background: '#2563eb' }}
            >
              {(activePriority !== 'ALL' ? 1 : 0) + (activeReadFilter !== 'ALL' ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div
          className="flex items-center gap-4 mb-4 px-4 py-3 rounded-xl flex-wrap"
          style={{ background: '#f8fafc', border: '1px solid #e8edf2' }}
        >
          {/* Priority */}
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>Priority:</span>
            <div className="flex items-center gap-1">
              {PRIORITIES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setActivePriority(p.key)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-all',
                    activePriority === p.key
                      ? 'text-white shadow-sm'
                      : 'text-gray-500 hover:bg-white',
                  )}
                  style={{
                    background: activePriority === p.key ? (p.color || '#3b82f6') : 'transparent',
                    border: `1px solid ${activePriority === p.key ? 'transparent' : '#e2e8f0'}`,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: '#e2e8f0' }} />

          {/* Read/Unread */}
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>Status:</span>
            <div className="flex items-center gap-1">
              {READ_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setActiveReadFilter(f.key)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-all',
                    activeReadFilter === f.key
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-gray-500 hover:bg-white',
                  )}
                  style={{
                    border: `1px solid ${activeReadFilter === f.key ? 'transparent' : '#e2e8f0'}`,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clear filters */}
          {(activePriority !== 'ALL' || activeReadFilter !== 'ALL') && (
            <button
              onClick={() => {
                setActivePriority('ALL');
                setActiveReadFilter('ALL');
              }}
              className="text-[11.5px] font-semibold text-red-500 hover:text-red-700 transition-colors ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center justify-between mb-3 px-4 py-2.5 rounded-xl"
          style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}
        >
          <span style={{ fontSize: 12.5, color: '#1e40af', fontWeight: 600 }}>
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={bulkMarkRead}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors hover:bg-blue-100"
              style={{ color: '#2563eb' }}
            >
              <Check style={{ width: 12, height: 12 }} />
              Mark read
            </button>
            <button
              onClick={bulkDelete}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors hover:bg-red-100"
              style={{ color: '#ef4444' }}
            >
              <Trash2 style={{ width: 12, height: 12 }} />
              Delete
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2 py-1 rounded-md text-[12px] font-semibold text-gray-500 hover:bg-blue-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Notification List */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: '#fff',
          border: '1px solid #e8edf2',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        {/* List header */}
        <div
          className="flex items-center justify-between px-5 py-2.5"
          style={{ borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={notifications.length > 0 && selectedIds.size === notifications.length}
              onChange={selectAll}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
              {meta.total} notification{meta.total !== 1 ? 's' : ''}
            </span>
          </div>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            Page {meta.page} of {meta.totalPages || 1}
          </span>
        </div>

        {/* Items */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <RefreshCw
              className="animate-spin mb-3"
              style={{ width: 24, height: 24, color: '#94a3b8' }}
            />
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div
              className="flex items-center justify-center rounded-full mb-4"
              style={{ width: 56, height: 56, background: '#f1f5f9' }}
            >
              <Bell style={{ width: 24, height: 24, color: '#94a3b8' }} />
            </div>
            <p style={{ fontSize: 14, color: '#475569', fontWeight: 600 }}>
              No notifications found
            </p>
            <p style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 4, textAlign: 'center' }}>
              {searchQuery || activeCategory !== 'ALL' || activePriority !== 'ALL' || activeReadFilter !== 'ALL'
                ? 'Try adjusting your filters or search query'
                : "You're all caught up! New notifications will appear here."}
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onRead={handleRead}
              onDelete={handleDelete}
              onNavigate={handleNavigate}
              selected={selectedIds.has(n.id)}
              onSelect={toggleSelect}
            />
          ))
        )}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderTop: '1px solid #f1f5f9', background: '#fafbfc' }}
          >
            <p style={{ fontSize: 12, color: '#64748b' }}>
              Showing {(meta.page - 1) * meta.limit + 1}–
              {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => loadNotifications(meta.page - 1)}
                disabled={meta.page <= 1}
                className="flex items-center justify-center rounded-lg transition-colors disabled:opacity-40"
                style={{
                  width: 32,
                  height: 32,
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                  background: '#fff',
                }}
              >
                <ChevronLeft style={{ width: 14, height: 14 }} />
              </button>

              {/* Page numbers */}
              {Array.from({ length: Math.min(5, meta.totalPages) }, (_, i) => {
                let pageNum: number;
                if (meta.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (meta.page <= 3) {
                  pageNum = i + 1;
                } else if (meta.page >= meta.totalPages - 2) {
                  pageNum = meta.totalPages - 4 + i;
                } else {
                  pageNum = meta.page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => loadNotifications(pageNum)}
                    className="flex items-center justify-center rounded-lg text-[12px] font-semibold transition-colors"
                    style={{
                      width: 32,
                      height: 32,
                      background: meta.page === pageNum ? '#2563eb' : '#fff',
                      color: meta.page === pageNum ? '#fff' : '#64748b',
                      border: `1px solid ${meta.page === pageNum ? '#2563eb' : '#e2e8f0'}`,
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => loadNotifications(meta.page + 1)}
                disabled={meta.page >= meta.totalPages}
                className="flex items-center justify-center rounded-lg transition-colors disabled:opacity-40"
                style={{
                  width: 32,
                  height: 32,
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                  background: '#fff',
                }}
              >
                <ChevronRight style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}