// src/notifications/dto/notification.dto.ts

import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import {
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  UserRole,
} from '@prisma/client';

// ─── Query ──────────────────────────────────────────────────────────────────

export class NotificationQueryDto {
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  page?: string;

  @IsOptional()
  limit?: string;
}

// ─── Create (for manual / system-generated notifications) ───────────────────

export class CreateNotificationDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(UserRole)
  targetRole?: UserRole;

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @IsOptional()
  @IsString()
  actionUrl?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  eventData?: any;

  @IsOptional()
  @IsString()
  actorId?: string;
}

// ─── Update preference ──────────────────────────────────────────────────────

export class UpdateNotificationPreferenceDto {
  @IsEnum(NotificationCategory)
  category: NotificationCategory;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  showToast?: boolean;

  @IsOptional()
  @IsBoolean()
  playSound?: boolean;
}