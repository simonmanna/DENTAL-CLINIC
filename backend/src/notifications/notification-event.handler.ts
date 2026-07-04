import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
// ✅ FIX: Split the import - value import + type-only import
import { NotificationEvents } from './notification.constants';
import type { AppointmentEventPayload } from './notification.constants';

/**
 * Listens to domain events via @nestjs/event-emitter and:
 *  1. Persists notification(s) to the DB (via NotificationsService)
 *  2. Pushes them over WebSocket (via NotificationsGateway)
 *  3. Updates unread counts for affected users
 *
 * To add a new event:
 *  1. Add the event key to notification.constants.ts
 *  2. Add an @OnEvent handler below
 *  3. Done — the rest (DB + WS) is automatic.
 */
@Injectable()
export class NotificationEventHandler {
  private readonly logger = new Logger(NotificationEventHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly gateway: NotificationsGateway,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // APPOINTMENT EVENTS
  // ═══════════════════════════════════════════════════════════════════════

  @OnEvent(NotificationEvents.APPOINTMENT_CREATED)
  async handleAppointmentCreated(payload: AppointmentEventPayload) {
    await this.emitAppointmentNotification(payload, {
      title: 'New Appointment Booked',
      message: `Appointment ${payload.appointmentCode} scheduled for ${payload.patientName} with Dr. ${payload.dentistName} on ${this.formatDate(payload.scheduledAt)}`,
      type: NotificationType.INFO,
      priority: NotificationPriority.MEDIUM,
      roles: [UserRole.DENTIST, UserRole.RECEPTIONIST, UserRole.ADMIN],
    });
  }

  @OnEvent(NotificationEvents.APPOINTMENT_CONFIRMED)
  async handleAppointmentConfirmed(payload: AppointmentEventPayload) {
    await this.emitAppointmentNotification(payload, {
      title: 'Appointment Confirmed',
      message: `${payload.appointmentCode} for ${payload.patientName} has been confirmed`,
      type: NotificationType.SUCCESS,
      priority: NotificationPriority.LOW,
      roles: [UserRole.DENTIST, UserRole.RECEPTIONIST],
    });
  }

  @OnEvent(NotificationEvents.APPOINTMENT_ARRIVED)
  async handleAppointmentArrived(payload: AppointmentEventPayload) {
    // This one is HIGH priority — dentist needs to know the patient is waiting
    await this.emitAppointmentNotification(payload, {
      title: '🏥 Patient Has Arrived',
      message: `${payload.patientName} has checked in for appointment ${payload.appointmentCode}`,
      type: NotificationType.SUCCESS,
      priority: NotificationPriority.HIGH,
      roles: [UserRole.DENTIST, UserRole.NURSE, UserRole.RECEPTIONIST],
      // Also send directly to the assigned dentist
      directUserIds: [await this.getUserIdForStaff(payload.dentistId)],
    });
  }

  @OnEvent(NotificationEvents.APPOINTMENT_IN_PROGRESS)
  async handleAppointmentInProgress(payload: AppointmentEventPayload) {
    await this.emitAppointmentNotification(payload, {
      title: 'Appointment Started',
      message: `Dr. ${payload.dentistName} has started seeing ${payload.patientName}`,
      type: NotificationType.INFO,
      priority: NotificationPriority.LOW,
      roles: [UserRole.RECEPTIONIST],
    });
  }

  @OnEvent(NotificationEvents.APPOINTMENT_COMPLETED)
  async handleAppointmentCompleted(payload: AppointmentEventPayload) {
    await this.emitAppointmentNotification(payload, {
      title: 'Appointment Completed',
      message: `Appointment ${payload.appointmentCode} for ${payload.patientName} has been completed`,
      type: NotificationType.SUCCESS,
      priority: NotificationPriority.LOW,
      roles: [UserRole.RECEPTIONIST, UserRole.ADMIN],
    });
  }

  @OnEvent(NotificationEvents.APPOINTMENT_CANCELLED)
  async handleAppointmentCancelled(payload: AppointmentEventPayload) {
    await this.emitAppointmentNotification(payload, {
      title: '❌ Appointment Cancelled',
      message: `${payload.appointmentCode} for ${payload.patientName} was cancelled${payload.reason ? `: ${payload.reason}` : ''}`,
      type: NotificationType.WARNING,
      priority: NotificationPriority.HIGH,
      roles: [UserRole.DENTIST, UserRole.RECEPTIONIST, UserRole.ADMIN],
      directUserIds: [await this.getUserIdForStaff(payload.dentistId)],
    });
  }

  @OnEvent(NotificationEvents.APPOINTMENT_RESCHEDULED)
  async handleAppointmentRescheduled(payload: AppointmentEventPayload) {
    await this.emitAppointmentNotification(payload, {
      title: '🔄 Appointment Rescheduled',
      message: `${payload.appointmentCode} for ${payload.patientName} moved to ${this.formatDate(payload.scheduledAt)}`,
      type: NotificationType.WARNING,
      priority: NotificationPriority.MEDIUM,
      roles: [UserRole.DENTIST, UserRole.RECEPTIONIST],
      directUserIds: [await this.getUserIdForStaff(payload.dentistId)],
    });
  }

  @OnEvent(NotificationEvents.APPOINTMENT_NO_SHOW)
  async handleAppointmentNoShow(payload: AppointmentEventPayload) {
    await this.emitAppointmentNotification(payload, {
      title: 'Patient No-Show',
      message: `${payload.patientName} did not show up for appointment ${payload.appointmentCode}`,
      type: NotificationType.WARNING,
      priority: NotificationPriority.MEDIUM,
      roles: [UserRole.DENTIST, UserRole.RECEPTIONIST, UserRole.ADMIN],
    });
  }

  @OnEvent(NotificationEvents.APPOINTMENT_DRAFTED)
  async handleAppointmentDrafted(payload: AppointmentEventPayload) {
    await this.emitAppointmentNotification(payload, {
      title: 'Appointment Set to Draft',
      message: `${payload.appointmentCode} for ${payload.patientName} has been set to draft for rearrangement`,
      type: NotificationType.INFO,
      priority: NotificationPriority.LOW,
      roles: [UserRole.RECEPTIONIST, UserRole.ADMIN],
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SHARED HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Core method for all appointment notifications:
   *  1. Determine target users (by role + direct IDs)
   *  2. Persist to DB
   *  3. Push via WebSocket
   *  4. Update unread counts
   */
  private async emitAppointmentNotification(
    payload: AppointmentEventPayload,
    config: {
      title: string;
      message: string;
      type: NotificationType;
      priority: NotificationPriority;
      roles: UserRole[];
      directUserIds?: (string | null)[];
    },
  ) {
    try {
      // 1. Gather target users by role
      const roleUsers = await this.prisma.user.findMany({
        where: { role: { in: config.roles }, isActive: true },
        select: { id: true, role: true },
      });

      // 2. Merge with direct user IDs (deduplicated)
      const allUserIds = new Set<string>(roleUsers.map((u) => u.id));
      if (config.directUserIds) {
        for (const uid of config.directUserIds) {
          if (uid) allUserIds.add(uid);
        }
      }

      // 3. Remove the actor (person who triggered the event)
      if (payload.actorId) {
        allUserIds.delete(payload.actorId);
      }

      if (allUserIds.size === 0) return;

      // 4. Batch-create notifications
      const notificationData = Array.from(allUserIds).map((userId) => ({
        userId,
        title: config.title,
        message: config.message,
        type: config.type,
        category: NotificationCategory.APPOINTMENT,
        priority: config.priority,
        actionUrl: `/appointments/${payload.appointmentId}`,
        entityType: 'APPOINTMENT',
        entityId: payload.appointmentId,
        eventType: `appointment.${payload.newStatus.toLowerCase()}`,
        eventData: payload as any,
        actorId: payload.actorId ?? null,
      }));

      await this.prisma.notification.createMany({ data: notificationData });

      // 5. Fetch the created notifications (for WS emission with full data)
      const createdNotifications = await this.prisma.notification.findMany({
        where: {
          entityId: payload.appointmentId,
          eventType: `appointment.${payload.newStatus.toLowerCase()}`,
          userId: { in: Array.from(allUserIds) },
          createdAt: { gte: new Date(Date.now() - 5000) },
        },
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

      // 6. Emit via WebSocket to each user
      for (const notification of createdNotifications) {
        if (notification.userId) {
          this.gateway.sendToUser(notification.userId, notification);
        }
      }

      // 7. Update unread counts for each affected user
      for (const userId of allUserIds) {
        const user = roleUsers.find((u) => u.id === userId);
        const count = await this.notificationsService.getUnreadCount(
          userId,
          user?.role ?? UserRole.RECEPTIONIST,
        );
        this.gateway.sendUnreadCount(userId, count);
      }

      this.logger.log(
        `Sent ${createdNotifications.length} notifications for ${payload.appointmentCode} → ${payload.newStatus}`,
      );
    } catch (error) {
      // Notification failures should never break the main flow
      this.logger.error(
        `Failed to emit notification for appointment ${payload.appointmentId}:`,
        error,
      );
    }
  }

  /**
   * Look up the User.id for a Staff record.
   */
  private async getUserIdForStaff(staffId: string): Promise<string | null> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: { userId: true },
    });
    return staff?.userId ?? null;
  }

  private formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-UG', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }
}