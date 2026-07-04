// src/components/notifications/NotificationDropdown.tsx

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, Check, CheckCheck, ExternalLink, Trash2 } from 'lucide-react';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

// ─── Priority & Type styling ────────────────────────────────────────────────

const priorityDot: Record<string, string> = {
  LOW: '#94a3b8',
  MEDIUM: '#3b82f6',
  HIGH: '#f59e0b',
  URGENT: '#ef4444',
};

const categoryLabel: Record<string, { label: string; emoji: string }> = {
  APPOINTMENT: { label: 'Appointment', emoji: '📅' },
  CLINICAL: { label: 'Clinical', emoji: '🩺' },
  BILLING: { label: 'Billing', emoji: '💳' },
  INVENTORY: { label: 'Inventory', emoji: '📦' },
  SYSTEM: { label: 'System', emoji: '⚙️' },
  ADMIN: { label: 'Admin', emoji: '🔧' },
};

const typeColors: Record<string, { bg: string; border: string }> = {
  INFO: { bg: '#eff6ff', border: '#bfdbfe' },
  WARNING: { bg: '#fffbeb', border: '#fde68a' },
  ERROR: { bg: '#fef2f2', border: '#fecaca' },
  SUCCESS: { bg: '#f0fdf4', border: '#bbf7d0' },
};

// ─── Time formatter ─────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-UG', { month: 'short', day: 'numeric' });
}

// ─── Single notification item ───────────────────────────────────────────────

function NotificationItem({
  notification,
  onRead,
  onDelete,
  onNavigate,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (url: string) => void;
}) {
  const cat = categoryLabel[notification.category] || { label: 'System', emoji: '⚙️' };
  const colors = typeColors[notification.type] || typeColors.INFO;

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-all duration-150',
        notification.isRead
          ? 'opacity-60 hover:opacity-80'
          : 'hover:bg-slate-50',
      )}
      style={{
        borderBottom: '1px solid #f1f5f9',
        borderLeft: notification.isRead ? 'none' : `3px solid ${priorityDot[notification.priority]}`,
      }}
      onClick={() => {
        if (!notification.isRead) onRead(notification.id);
        if (notification.actionUrl) onNavigate(notification.actionUrl);
      }}
    >
      {/* Category emoji */}
      <div
        className="shrink-0 flex items-center justify-center rounded-lg mt-0.5"
        style={{
          width: 32,
          height: 32,
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          fontSize: 14,
        }}
      >
        {cat.emoji}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className="text-[13px] leading-tight truncate"
            style={{
              color: '#1e293b',
              fontWeight: notification.isRead ? 400 : 600,
            }}
          >
            {notification.title}
          </p>
          {!notification.isRead && (
            <span
              className="shrink-0 rounded-full mt-1.5"
              style={{
                width: 6,
                height: 6,
                background: priorityDot[notification.priority],
              }}
            />
          )}
        </div>

        <p
          className="text-[12px] mt-0.5 line-clamp-2"
          style={{ color: '#64748b', lineHeight: 1.45 }}
        >
          {notification.message}
        </p>

        <div className="flex items-center gap-2 mt-1.5">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{
              background: colors.bg,
              color: '#475569',
              fontWeight: 500,
            }}
          >
            {cat.label}
          </span>
          <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
            {timeAgo(notification.createdAt)}
          </span>
          {notification.actor?.staff && (
            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
              · by {notification.actor.staff.firstName}
            </span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute right-3 top-3 hidden group-hover:flex items-center gap-1">
        {!notification.isRead && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRead(notification.id);
            }}
            className="p-1 rounded-md hover:bg-blue-50 transition-colors"
            title="Mark as read"
          >
            <Check style={{ width: 12, height: 12, color: '#3b82f6' }} />
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
          <Trash2 style={{ width: 12, height: 12, color: '#ef4444' }} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Dropdown ──────────────────────────────────────────────────────────

interface NotificationDropdownProps {
  accentColor?: string;
}

export function NotificationDropdown({ accentColor = '#0ea5e9' }: NotificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const {
    unreadCount,
    recentNotifications,
    isConnected,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNavigate = (url: string) => {
    setIsOpen(false);
    navigate(url);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="relative flex items-center justify-center rounded-lg transition-all"
        style={{ width: 36, height: 30, color: '#64748b' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = '#f1f5f9';
          (e.currentTarget as HTMLElement).style.color = accentColor;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
          (e.currentTarget as HTMLElement).style.color = '#64748b';
        }}
      >
        <Bell style={{ width: 16, height: 16 }} />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white"
            style={{
              minWidth: 16,
              height: 16,
              fontSize: 9,
              fontWeight: 700,
              padding: '0 4px',
              background: '#ef4444',
              lineHeight: 1,
              boxShadow: '0 0 0 2px #fff',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* Connection indicator */}
        <span
          className="absolute bottom-0.5 right-0.5 rounded-full"
          style={{
            width: 5,
            height: 5,
            background: isConnected ? '#22c55e' : '#ef4444',
            boxShadow: '0 0 0 1.5px #fff',
          }}
        />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="absolute right-0 top-11 z-50 overflow-hidden"
          style={{
            width: 380,
            background: '#fff',
            borderRadius: 14,
            boxShadow: '0 12px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
            border: '1px solid #e8edf2',
            maxHeight: '70vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: '1px solid #f1f5f9' }}
          >
            <div className="flex items-center gap-2">
              <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                  style={{ background: '#ef4444' }}
                >
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors hover:bg-blue-50"
                  style={{ color: accentColor }}
                >
                  <CheckCheck style={{ width: 12, height: 12 }} />
                  Read all
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 hover:bg-gray-100 transition-colors"
                style={{ color: '#94a3b8' }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ scrollbarWidth: 'thin', maxHeight: 420 }}
          >
            {recentNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <div
                  className="flex items-center justify-center rounded-full mb-3"
                  style={{ width: 48, height: 48, background: '#f1f5f9' }}
                >
                  <Bell style={{ width: 20, height: 20, color: '#94a3b8' }} />
                </div>
                <p style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                  No notifications yet
                </p>
                <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
                  You'll see appointment updates and alerts here
                </p>
              </div>
            ) : (
              recentNotifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onRead={markAsRead}
                  onDelete={deleteNotification}
                  onNavigate={handleNavigate}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {recentNotifications.length > 0 && (
            <div
              className="px-4 py-2.5 text-center shrink-0"
              style={{ borderTop: '1px solid #f1f5f9' }}
            >
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/notifications');
                }}
                className="flex items-center justify-center gap-1.5 w-full text-[12.5px] font-semibold transition-colors hover:opacity-80"
                style={{ color: accentColor }}
              >
                View all notifications
                <ExternalLink style={{ width: 11, height: 11 }} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}