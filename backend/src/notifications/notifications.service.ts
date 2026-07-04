// src/notifications/notifications.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import {
  CreateNotificationDto,
  NotificationQueryDto,
} from './dto/notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── CREATE ──────────────────────────────────────────────────────────────

  /**
   * Create a single notification for a specific user.
   */
  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        userId: dto.userId ?? null,
        targetRole: dto.targetRole ?? null,
        title: dto.title,
        message: dto.message,
        type: dto.type ?? NotificationType.INFO,
        category: dto.category ?? NotificationCategory.SYSTEM,
        priority: dto.priority ?? NotificationPriority.MEDIUM,
        actionUrl: dto.actionUrl,
        entityType: dto.entityType,
        entityId: dto.entityId,
        eventType: dto.eventType,
        eventData: dto.eventData ?? Prisma.JsonNull,
        actorId: dto.actorId,
      },
    });
  }

  /**
   * Broadcast: create one notification per targeted user.
   * - If `targetRole` is set, sends to all active users with that role.
   * - If `userIds` is provided, sends to those specific users.
   * - Excludes the actor (person who triggered the event).
   */
  async broadcast(
    dto: CreateNotificationDto,
    options?: { userIds?: string[]; excludeUserId?: string },
  ) {
    let targetUserIds: string[] = [];

    if (options?.userIds?.length) {
      targetUserIds = options.userIds;
    } else if (dto.targetRole) {
      const users = await this.prisma.user.findMany({
        where: { role: dto.targetRole, isActive: true },
        select: { id: true },
      });
      targetUserIds = users.map((u) => u.id);
    } else {
      // Broadcast to ALL active users
      const users = await this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      targetUserIds = users.map((u) => u.id);
    }

    // Exclude the actor
    if (options?.excludeUserId) {
      targetUserIds = targetUserIds.filter(
        (id) => id !== options.excludeUserId,
      );
    }

    if (targetUserIds.length === 0) return [];

    // Batch insert
    const data = targetUserIds.map((uid) => ({
      userId: uid,
      targetRole: dto.targetRole ?? null,
      title: dto.title,
      message: dto.message,
      type: dto.type ?? NotificationType.INFO,
      category: dto.category ?? NotificationCategory.SYSTEM,
      priority: dto.priority ?? NotificationPriority.MEDIUM,
      actionUrl: dto.actionUrl,
      entityType: dto.entityType,
      entityId: dto.entityId,
      eventType: dto.eventType,
      eventData: dto.eventData ?? Prisma.JsonNull,
      actorId: dto.actorId,
    }));

    await this.prisma.notification.createMany({ data });

    // Return the created notifications for real-time emission
    return this.prisma.notification.findMany({
      where: {
        userId: { in: targetUserIds },
        eventType: dto.eventType,
        entityId: dto.entityId,
        createdAt: { gte: new Date(Date.now() - 5000) }, // within last 5s
      },
      orderBy: { createdAt: 'desc' },
      take: targetUserIds.length,
    });
  }

  /**
   * Send to multiple roles at once (e.g. DENTIST + RECEPTIONIST).
   */
  async broadcastToRoles(
    dto: Omit<CreateNotificationDto, 'targetRole'>,
    roles: UserRole[],
    excludeUserId?: string,
  ) {
    const users = await this.prisma.user.findMany({
      where: { role: { in: roles }, isActive: true },
      select: { id: true },
    });

    const userIds = users
      .map((u) => u.id)
      .filter((id) => id !== excludeUserId);

    if (userIds.length === 0) return [];

    return this.broadcast(
      { ...dto } as CreateNotificationDto,
      { userIds, excludeUserId },
    );
  }

  // ── READ ────────────────────────────────────────────────────────────────

  /**
   * Get paginated notifications for a specific user.
   * Includes role-based notifications the user qualifies for.
   */
  async findAllForUser(userId: string, userRole: UserRole, query: NotificationQueryDto) {
    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit = Math.min(100, parseInt(query.limit as string, 10) || 20);
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      OR: [
        { userId },                              // Direct notifications
        { userId: null, targetRole: userRole },   // Role-broadcast
        { userId: null, targetRole: null },       // Global broadcast
      ],
      ...(query.category && { category: query.category }),
      ...(query.type && { type: query.type }),
      ...(query.priority && { priority: query.priority }),
      ...(query.isRead !== undefined && { isRead: query.isRead }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { message: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.startDate &&
        query.endDate && {
          createdAt: {
            gte: new Date(query.startDate),
            lte: new Date(query.endDate),
          },
        }),
    };

    const [total, notifications] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: {
              id: true,
              staff: {
                select: { firstName: true, lastName: true, avatar: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: notifications,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get unread count for badge display.
   */
  async getUnreadCount(userId: string, userRole: UserRole): Promise<number> {
    return this.prisma.notification.count({
      where: {
        OR: [
          { userId, isRead: false },
          { userId: null, targetRole: userRole, isRead: false },
          { userId: null, targetRole: null, isRead: false },
        ],
      },
    });
  }

  /**
   * Get recent unread notifications (for dropdown preview).
   */
  async getRecentUnread(userId: string, userRole: UserRole, take = 8) {
    return this.prisma.notification.findMany({
      where: {
        OR: [
          { userId, isRead: false },
          { userId: null, targetRole: userRole, isRead: false },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        actor: {
          select: {
            id: true,
            staff: {
              select: { firstName: true, lastName: true, avatar: true },
            },
          },
        },
      },
    });
  }

  // ── UPDATE ──────────────────────────────────────────────────────────────

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  // ── DELETE ──────────────────────────────────────────────────────────────

  async delete(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    return this.prisma.notification.delete({ where: { id } });
  }

  async deleteAllRead(userId: string) {
    return this.prisma.notification.deleteMany({
      where: { userId, isRead: true },
    });
  }

  // ── CLEANUP (cron-friendly) ─────────────────────────────────────────────

  /**
   * Remove notifications older than `days`. Call from a cron job.
   */
  async purgeOld(days = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
  }
}