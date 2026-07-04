// src/notifications/notifications.module.ts

import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationEventHandler } from './notification-event.handler';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationEventHandler,
    PrismaService,
  ],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}