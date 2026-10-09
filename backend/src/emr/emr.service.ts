// src/emr/emr.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export class CreateEMRDto {
  patientId: string;
  dentistId: string;
  appointmentId?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  bloodPressure?: string;
  pulseRate?: number;
  temperature?: number;
  weight?: number;
  height?: number;
  oxygenSat?: number;
  diagnosis?: string[];
  icdCodes?: string[];
  findings?: string;
  recommendations?: string;
  followUpDate?: string;
  followUpNotes?: string;
}

export class CreateLabOrderDto {
  patientId: string;
  appointmentId?: string;
  emrId?: string;
  testName: string;
  category: string;
  instructions?: string;
  urgency?: 'ROUTINE' | 'URGENT' | 'STAT';
}

/** Events read per source before the timeline is merged and cut. */
const TIMELINE_PER_SOURCE = 50;

@Injectable()
export class EmrService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateEMRDto) {
    return this.prisma.eMRRecord.create({
      data: {
        ...dto,
        diagnosis: dto.diagnosis || [],
        icdCodes: dto.icdCodes || [],
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        dentist: { select: { id: true, firstName: true, lastName: true } },
        attachments: true,
        labOrders: true,
      },
    });
  }

  async findByPatient(patientId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [total, records] = await Promise.all([
      this.prisma.eMRRecord.count({ where: { patientId } }),
      this.prisma.eMRRecord.findMany({
        where: { patientId },
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          dentist: { select: { firstName: true, lastName: true } },
          attachments: true,
          labOrders: true,
          _count: { select: { attachments: true } },
        },
      }),
    ]);
    return { data: records, meta: { total, page, limit } };
  }

  async findOne(id: string) {
    const record = await this.prisma.eMRRecord.findUnique({
      where: { id },
      include: {
        patient: true,
        dentist: true,
        attachments: true,
        labOrders: true,
        appointment: {
          include: {},
        },
      },
    });
    if (!record) throw new NotFoundException('EMR record not found');
    return record;
  }

  async update(id: string, dto: Partial<CreateEMRDto>) {
    return this.prisma.eMRRecord.update({
      where: { id },
      data: {
        ...dto,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
      },
      include: { attachments: true, labOrders: true },
    });
  }

  async addAttachment(emrId: string, file: { name: string; fileUrl: string; fileType: string; fileSize?: number }) {
    return this.prisma.eMRAttachment.create({ data: { emrId, ...file } });
  }

  async createLabOrder(dto: CreateLabOrderDto) {
    const code = `LAB-${Date.now()}`;
    return this.prisma.labOrder.create({
      data: { orderCode: code, urgency: 'ROUTINE', ...dto },
      include: { patient: { select: { firstName: true, lastName: true } } },
    });
  }

  async getLabOrders(patientId?: string, status?: string) {
    return this.prisma.labOrder.findMany({
      where: {
        ...(patientId && { patientId }),
        ...(status && { status }),
      },
      include: {
        patient: { select: { firstName: true, lastName: true, patientCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateLabOrder(id: string, data: { status?: string; resultNotes?: string; resultFileUrl?: string }) {
    return this.prisma.labOrder.update({
      where: { id },
      data: { ...data, completedAt: data.status === 'COMPLETED' ? new Date() : undefined },
    });
  }

  async getPatientTimeline(patientId: string) {
    const take = TIMELINE_PER_SOURCE;
    const [appointments, visits, emrRecords, invoices, prescriptions, imagingRecords] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { patientId },
        select: { id: true, scheduledAt: true, type: true, status: true, chiefComplaint: true },
        orderBy: { scheduledAt: 'desc' }, take,
      }),
      this.prisma.visit.findMany({
        where: { patientId },
        select: { id: true, visitCode: true, status: true, chiefComplaint: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take,
      }),
      this.prisma.eMRRecord.findMany({
        where: { patientId },
        select: { id: true, createdAt: true, assessment: true, diagnosis: true },
        orderBy: { createdAt: 'desc' }, take,
      }),
      this.prisma.invoice.findMany({
        // Soft-deleted drafts are not part of the patient's history.
        where: { patientId, deletedAt: null },
        select: { id: true, invoiceNumber: true, total: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take,
      }),
      this.prisma.prescription.findMany({
        where: { patientId },
        select: { id: true, prescriptionCode: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, take,
      }),
      this.prisma.imagingRecord.findMany({
        where: { patientId },
        select: { id: true, type: true,  takenAt: true },
        orderBy: { takenAt: 'desc' }, take,
      }),
    ]);

    const sources = [
      appointments.map(a => ({ type: 'APPOINTMENT', date: a.scheduledAt, data: a })),
      visits.map(v => ({ type: 'VISIT', date: v.createdAt, data: v })),
      emrRecords.map(e => ({ type: 'EMR', date: e.createdAt, data: e })),
      invoices.map(i => ({ type: 'INVOICE', date: i.createdAt, data: i })),
      prescriptions.map(p => ({ type: 'PRESCRIPTION', date: p.createdAt, data: p })),
      imagingRecords.map(i => ({ type: 'IMAGING', date: i.takenAt, data: i })),
    ];

    // Each source is capped separately, so below the oldest event of a source
    // that hit its cap the history is incomplete. Cutting the merged list
    // there keeps it a true chronology instead of one with silent gaps (the
    // old per-source caps of 10–20 dropped recent invoices while showing
    // years-old appointments).
    const cutoff = Math.max(
      -Infinity,
      ...sources
        .filter((events) => events.length >= take)
        .map((events) => new Date(events[events.length - 1].date).getTime()),
    );

    return sources
      .flat()
      .filter((e) => new Date(e.date).getTime() >= cutoff)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
}
