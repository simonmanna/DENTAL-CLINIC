// src/notifications/notifications.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import {
  NotificationQueryDto,
  CreateNotificationDto,
} from './dto/notification.dto';

/**
 * REST endpoints for notification management.
 * Real-time delivery is handled by the WebSocket gateway — these endpoints
 * are for fetching history, marking read, and manual creation.
 *
 * NOTE: Replace `req.user` access with your actual auth guard / decorator.
 * The examples assume a JWT guard that populates req.user = { id, role }.
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  // ── List with filters & pagination ────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List notifications for the authenticated user' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'isRead', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Req() req: any, @Query() query: NotificationQueryDto) {
    const { id: userId, role } = req.user;
    return this.svc.findAllForUser(userId, role, query);
  }

  // ── Unread count (for badge) ──────────────────────────────────────────

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@Req() req: any) {
    const { id: userId, role } = req.user;
    const count = await this.svc.getUnreadCount(userId, role);
    return { count };
  }

  // ── Recent unread (for dropdown) ──────────────────────────────────────

  @Get('recent')
  @ApiOperation({ summary: 'Get recent unread notifications (dropdown preview)' })
  @ApiQuery({ name: 'take', required: false, example: 8 })
  getRecent(@Req() req: any, @Query('take') take?: string) {
    const { id: userId, role } = req.user;
    return this.svc.getRecentUnread(userId, role, take ? parseInt(take) : 8);
  }

  // ── Mark single as read ───────────────────────────────────────────────

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as read' })
  markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.svc.markAsRead(id, req.user.id);
  }

  // ── Mark all as read ──────────────────────────────────────────────────

  @Post('mark-all-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead(@Req() req: any) {
    return this.svc.markAllAsRead(req.user.id);
  }

  // ── Delete single ─────────────────────────────────────────────────────

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  delete(@Param('id') id: string, @Req() req: any) {
    return this.svc.delete(id, req.user.id);
  }

  // ── Delete all read ───────────────────────────────────────────────────

  @Delete('clear-read')
  @ApiOperation({ summary: 'Delete all read notifications' })
  deleteAllRead(@Req() req: any) {
    return this.svc.deleteAllRead(req.user.id);
  }

  // ── Manual creation (admin/system use) ────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a notification manually (admin)' })
  create(@Body() dto: CreateNotificationDto, @Req() req: any) {
    dto.actorId = req.user.id;
    return this.svc.create(dto);
  }
}