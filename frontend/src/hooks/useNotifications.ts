// src/hooks/useNotifications.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';
import { toast } from 'react-hot-toast';
import api from '@/lib/api/client';

export interface Notification {
  id: string;
  userId: string | null;
  targetRole: string | null;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
  category: 'APPOINTMENT' | 'CLINICAL' | 'BILLING' | 'INVENTORY' | 'SYSTEM' | 'ADMIN';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  isRead: boolean;
  readAt: string | null;
  actionUrl: string | null;
  entityType: string | null;
  entityId: string | null;
  eventType: string | null;
  eventData: any;
  actorId: string | null;
  actor?: {
    id: string;
    staff?: { firstName: string; lastName: string; avatar: string | null };
  };
  createdAt: string;
}

export interface NotificationQueryParams {
  category?: string;
  type?: string;
  priority?: string;
  isRead?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

let notificationSound: HTMLAudioElement | null = null;
function playNotificationSound() {
  try {
    if (!notificationSound) {
      notificationSound = new Audio(
        'data:audio/wav;base64,UklGRl9vT19teleVFMQQBAAAAAABAIAAABAABAAEAIAAYAAAA'
      );
      notificationSound.volume = 0.3;
    }
    notificationSound.currentTime = 0;
    notificationSound.play().catch(() => {});
  } catch {}
}

function showNotificationToast(notification: Notification) {
  const icons: Record<string, string> = {
    INFO: 'ℹ️',
    WARNING: '⚠️',
    ERROR: '❌',
    SUCCESS: '✅',
  };
  const icon = icons[notification.type] || 'ℹ️';

  if (notification.priority === 'HIGH' || notification.priority === 'URGENT') {
    playNotificationSound();
    toast(`${icon} ${notification.title}\n${notification.message}`, {
      duration: notification.priority === 'URGENT' ? 8000 : 5000,
      style: {
        background: notification.priority === 'URGENT' ? '#fef2f2' : '#fff',
        border: notification.priority === 'URGENT' ? '1px solid #fecaca' : '1px solid #e2e8f0',
        padding: '12px 16px',
        fontSize: '13px',
        maxWidth: '380px',
        lineHeight: '1.5',
      },
    });
  } else if (notification.priority === 'MEDIUM') {
    toast(`${icon} ${notification.title}`, {
      duration: 3000,
      style: {
        background: '#fff',
        border: '1px solid #e2e8f0',
        padding: '10px 14px',
        fontSize: '13px',
      },
    });
  }
}

const WS_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

export function useNotifications() {
  const { user, token } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
// Line 96 - ✅ Single <
const [recentNotifications, setRecentNotifications] = useState<Notification[]>([]);

// Line 98 - ✅ Single <
const socketRef = useRef<Socket | null>(null);

  // ── Single WebSocket Connection ─────────────────────────────────────
  useEffect(() => {
    if (!user?.id || !token) {
      setIsConnected(false);
      return;
    }

    const socket = io(`${WS_URL}/notifications`, {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
      setIsConnected(true);
      socket.emit('join', { userId: user.id, role: user.role });
    });

    socket.on('disconnect', (reason) => {
      console.warn('🔌 Socket disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Socket connection error:', err.message);
      setIsConnected(false);
    });

    socket.on('unread_count', ({ count }: { count: number }) => {
      setUnreadCount(count);
    });

    socket.on('notification', (notification: Notification) => {
      setRecentNotifications((prev) => {
        const exists = prev.some((n) => n.id === notification.id);
        if (exists) return prev;
        return [notification, ...prev].slice(0, 20);
      });
      showNotificationToast(notification);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, user?.role, token]);

  // ── Initial REST Fetch ─────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    fetchUnreadCount();
    fetchRecentNotifications();
  }, [user?.id]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnreadCount(data.count);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, []);

  const fetchRecentNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/recent?take=8');
      setRecentNotifications(data);
    } catch (err) {
      console.error('Failed to fetch recent notifications:', err);
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setRecentNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await api.post('/notifications/mark-all-read');
      setRecentNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    try {
      await api.delete(`/notifications/${id}`);
      setRecentNotifications((prev) => prev.filter((n) => n.id !== id));
      fetchUnreadCount();
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  }, [fetchUnreadCount]);

  const fetchAll = useCallback(
    async (params: NotificationQueryParams = {}) => {
      const query = new URLSearchParams();
      if (params.category) query.set('category', params.category);
      if (params.type) query.set('type', params.type);
      if (params.priority) query.set('priority', params.priority);
      if (params.isRead !== undefined) query.set('isRead', String(params.isRead));
      if (params.search) query.set('search', params.search);
      if (params.page) query.set('page', String(params.page));
      if (params.limit) query.set('limit', String(params.limit));

      const { data } = await api.get(`/notifications?${query.toString()}`);
      return data;
    },
    [],
  );

  return {
    unreadCount,
    recentNotifications,
    isConnected,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchAll,
    fetchUnreadCount,
    fetchRecentNotifications,
  };
}