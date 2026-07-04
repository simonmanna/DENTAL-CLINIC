// src/notifications/notifications.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

/**
 * Real-time notification delivery via WebSockets.
 *
 * Architecture:
 *  - Each authenticated user joins a room named `user:<userId>`
 *  - Role-based broadcasts go to `role:<ROLE_NAME>`
 *  - The NotificationEventHandler calls gateway.sendToUser / gateway.sendToRole
 *    after persisting notifications to the DB.
 *
 * Client connection:
 *   const socket = io('ws://localhost:3000/notifications', {
 *     auth: { token: '<jwt>' }      // or query: { userId, role }
 *   });
 *
 * Events emitted TO clients:
 *   'notification'        — a new notification object
 *   'unread_count'        — updated unread count number
 *
 * Events received FROM clients:
 *   'join'                — { userId, role } → joins the correct rooms
 *   'mark_read'           — { notificationId } → acknowledged
 */
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: '*', // Tighten in production
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  // Track online users: userId → Set<socketId>
  private userSockets = new Map<string, Set<string>>();

  // ── Lifecycle ─────────────────────────────────────────────────────────

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    // Clean up user→socket mapping
    for (const [userId, sockets] of this.userSockets.entries()) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ── Client events ─────────────────────────────────────────────────────

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; role: string },
  ) {
    if (!data.userId) return;

    // Join user-specific room
    client.join(`user:${data.userId}`);

    // Join role-specific room
    if (data.role) {
      client.join(`role:${data.role}`);
    }

    // Track socket
    if (!this.userSockets.has(data.userId)) {
      this.userSockets.set(data.userId, new Set());
    }
    this.userSockets.get(data.userId)!.add(client.id);

    this.logger.log(
      `User ${data.userId} (${data.role}) joined — socket ${client.id}`,
    );

    // Send confirmation
    client.emit('joined', { userId: data.userId, role: data.role });
  }

  @SubscribeMessage('mark_read')
  handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: string },
  ) {
    // The actual DB update happens via REST; this just acknowledges the WS side
    this.logger.debug(`mark_read acknowledged: ${data.notificationId}`);
  }

  // ── Server-side emission (called by NotificationEventHandler) ─────────

  /**
   * Send a notification to a specific user (all their connected sockets).
   */
  sendToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  /**
   * Send updated unread count to a specific user.
   */
  sendUnreadCount(userId: string, count: number) {
    this.server.to(`user:${userId}`).emit('unread_count', { count });
  }

  /**
   * Broadcast to all users with a specific role.
   */
  sendToRole(role: string, notification: any) {
    this.server.to(`role:${role}`).emit('notification', notification);
  }

  /**
   * Broadcast to multiple roles.
   */
  sendToRoles(roles: string[], notification: any) {
    for (const role of roles) {
      this.sendToRole(role, notification);
    }
  }

  /**
   * Broadcast to everyone connected.
   */
  sendToAll(notification: any) {
    this.server.emit('notification', notification);
  }

  /**
   * Check if a user is currently online.
   */
  isUserOnline(userId: string): boolean {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }

  /**
   * Get count of online users.
   */
  getOnlineCount(): number {
    return this.userSockets.size;
  }
}
