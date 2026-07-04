// src/notifications/notification.constants.ts

// ─── EVENT TYPES ────────────────────────────────────────────────────────────
// Single source of truth for every event the system can emit.
// Add new events here — the handler map in NotificationEventHandler picks them up.

export const NotificationEvents = {
  // Appointment lifecycle
  APPOINTMENT_CREATED: 'appointment.created',
  APPOINTMENT_CONFIRMED: 'appointment.confirmed',
  APPOINTMENT_CANCELLED: 'appointment.cancelled',
  APPOINTMENT_RESCHEDULED: 'appointment.rescheduled',
  APPOINTMENT_ARRIVED: 'appointment.arrived',
  APPOINTMENT_IN_PROGRESS: 'appointment.in_progress',
  APPOINTMENT_COMPLETED: 'appointment.completed',
  APPOINTMENT_NO_SHOW: 'appointment.no_show',
  APPOINTMENT_DRAFTED: 'appointment.drafted',

  // Visit lifecycle (future)
  VISIT_STARTED: 'visit.started',
  VISIT_COMPLETED: 'visit.completed',

  // Billing (future)
  INVOICE_CREATED: 'invoice.created',
  INVOICE_OVERDUE: 'invoice.overdue',
  PAYMENT_RECEIVED: 'payment.received',

  // Inventory (future)
  STOCK_LOW: 'inventory.stock_low',
  STOCK_EXPIRED: 'inventory.stock_expired',

  // Clinical (future)
  LAB_ORDER_READY: 'clinical.lab_order_ready',
  IMAGING_READY: 'clinical.imaging_ready',

  // System
  SYSTEM_ANNOUNCEMENT: 'system.announcement',
} as const;

export type NotificationEvent =
  (typeof NotificationEvents)[keyof typeof NotificationEvents];

// ─── EVENT PAYLOADS ─────────────────────────────────────────────────────────
// Type-safe payloads for each event family.

export interface AppointmentEventPayload {
  appointmentId: string;
  appointmentCode: string;
  patientId: string;
  patientName: string;
  dentistId: string;
  dentistName: string;
  previousStatus?: string;
  newStatus: string;
  scheduledAt: string;
  reason?: string;       // For cancellation/reschedule
  actorId?: string;      // Who triggered the change
  actorName?: string;
}

export interface VisitEventPayload {
  visitId: string;
  visitCode: string;
  patientId: string;
  patientName: string;
  dentistId: string;
  dentistName: string;
}

export interface InventoryEventPayload {
  itemId: string;
  itemName: string;
  currentQuantity: number;
  minQuantity: number;
  locationId?: string;
  locationName?: string;
}

// Union of all payloads
export type NotificationEventPayload =
  | AppointmentEventPayload
  | VisitEventPayload
  | InventoryEventPayload
  | Record<string, any>;