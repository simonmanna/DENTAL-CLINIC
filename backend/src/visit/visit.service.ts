// src/visits/visits.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus, VisitStatus, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { DocumentNumberService } from '../common/document-number/document-number.service';

import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsNotEmpty,
  IsArray,
  IsNumber,
  ValidateNested,
} from 'class-validator';

// DTOs
export class CreateVisitDto {
  @IsString()
  @IsNotEmpty()
  appointmentId: string;

  @IsString()
  @IsNotEmpty()
  dentistId: string;
}

export class UpdateClinicalNotesDto {
  @IsOptional() @IsString() chiefComplaint?: string;
  @IsOptional() @IsString() historyOfPresentIllness?: string;
  @IsOptional() @IsString() subjective?: string;
  @IsOptional() @IsString() objective?: string;
  @IsOptional() @IsString() assessment?: string;
  @IsOptional() @IsString() plan?: string;
  @IsOptional() @IsString() findings?: string;
  @IsOptional() @IsString() recommendations?: string;
}

export class UpdateVitalsDto {
  @IsOptional() @IsString() bloodPressure?: string;
  @IsOptional() @IsNumber() pulseRate?: number;
  @IsOptional() @IsNumber() temperature?: number;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsNumber() height?: number;
  @IsOptional() @IsNumber() oxygenSat?: number;
}

export class AddProcedureDto {
  @IsString() @IsNotEmpty() procedureId: string;
  @IsOptional() toothNumbers?: number[];
  @IsOptional() surfaces?: string[];
  @IsOptional() @IsString() notes?: string;
  @IsNumber() @Min(0) cost: number;
}

export class PrescriptionItemDto {
  @IsString() @IsNotEmpty() drugId: string;
  @IsString() @IsNotEmpty() dosage: string;
  @IsString() @IsNotEmpty() frequency: string;
  @IsString() @IsNotEmpty() duration: string;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsString() route?: string;
  @IsOptional() @IsString() instructions?: string;
}

export class WritePrescriptionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];

  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() validUntil?: string;
}

export class ProcessPaymentDto {
  @IsNumber() @Min(0) amount: number;
  @IsString() @IsNotEmpty() method: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CompleteVisitDto {
  @IsOptional() @IsString() followUpDate?: string;
  @IsOptional() @IsString() followUpNotes?: string;
  @IsOptional() @IsString() recommendations?: string;
}

@Injectable()
export class VisitsService {
  constructor(
    private prisma: PrismaService,
    private docNum: DocumentNumberService,
  ) {}

  /**
   * STEP 1: Create Visit from Checked-In Appointment
   * Called when patient arrives and is checked in
   */
  async createVisit(dto: CreateVisitDto) {
    // ✅ GUARD: Validate required IDs before hitting Prisma
    if (!dto.appointmentId) {
      throw new BadRequestException('appointmentId is required');
    }
    if (!dto.dentistId) {
      throw new BadRequestException('dentistId is required');
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: { patient: true, visit: true },
    });

    if (!appointment) throw new NotFoundException('Appointment not found');

    if (!appointment.dentistId) {
      throw new BadRequestException('Appointment has no assigned dentist');
    }

    const dentistExists = await this.prisma.staff.findUnique({
      where: { id: appointment.dentistId },
    });

    if (!dentistExists) {
      throw new BadRequestException(
        `Dentist with ID ${appointment.dentistId} not found`,
      );
    }

    if (appointment.visit) {
      throw new BadRequestException(
        'Visit already exists for this appointment',
      );
    }

    if (appointment.status !== AppointmentStatus.ARRIVED) {
      throw new BadRequestException('Patient must be checked in first');
    }

    const visit = await this.prisma.$transaction(async (tx) => {
      const visitCode = await this.docNum.next('VIS', tx);
      const newVisit = await tx.visit.create({
        data: {
          visitCode,
          appointmentId: dto.appointmentId,
          patientId: appointment.patientId,
          dentistId: appointment.dentistId,
          status: VisitStatus.IN_PROGRESS,
          checkedInAt: new Date(),
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              patientCode: true,
              allergies: true,
              medicalConditions: true,
              dateOfBirth: true,
              gender: true,
            },
          },
          dentist: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialization: true,
            },
          },
        },
      });

      // ✅ FIX: Use tx (transaction client), not this.prisma
      await tx.appointment.update({
        where: { id: dto.appointmentId },
        data: {
          status: AppointmentStatus.IN_PROGRESS,
        },
      });

      return newVisit;
    });

    return visit;
  }
  // async createVisit(dto: CreateVisitDto) {
  //   const appointment = await this.prisma.appointment.findUnique({
  //     where: { id: dto.appointmentId },
  //     include: { patient: true, visit: true },
  //   });

  //   if (!appointment) throw new NotFoundException('Appointment not found');

  //   if (!appointment.dentistId) {
  //     throw new BadRequestException('Appointment has no assigned dentist');
  //   }

  //   const dentistExists = await this.prisma.staff.findUnique({
  //     where: { id: appointment.dentistId },
  //   });

  //   if (!dentistExists) {
  //     throw new BadRequestException(
  //       `Dentist with ID ${appointment.dentistId} not found`,
  //     );
  //   }

  //   if (appointment.visit)
  //     throw new BadRequestException(
  //       'Visit already exists for this appointment',
  //     );
  //   if (appointment.status !== AppointmentStatus.ARRIVED) {
  //     throw new BadRequestException('Patient must be checked in first');
  //   }

  //   const visitCode = await this.generateVisitCode();

  //   const visit = await this.prisma.$transaction(async (tx) => {
  //     // Create the visit
  //     const newVisit = await tx.visit.create({
  //       data: {
  //         visitCode,
  //         appointmentId: dto.appointmentId,
  //         patientId: appointment.patientId,
  //         // dentistId: dto.dentistId,
  //         dentistId: appointment.dentistId,
  //         status: VisitStatus.ARRIVED,
  //         checkedInAt: new Date(),
  //       },
  //       include: {
  //         patient: {
  //           select: {
  //             id: true,
  //             firstName: true,
  //             lastName: true,
  //             patientCode: true,
  //             allergies: true,
  //             medicalConditions: true,
  //             dateOfBirth: true,
  //             gender: true,
  //           },
  //         },
  //         dentist: {
  //           select: {
  //             id: true,
  //             firstName: true,
  //             lastName: true,
  //             specialization: true,
  //           },
  //         },
  //       },
  //     });

  //     // Update appointment to link visit
  //     // await tx.appointment.update({
  //     //   where: { id: dto.appointmentId },
  //     //   data: {
  //     //     visitId: newVisit.id,
  //     //     actualStartAt: new Date(),
  //     //   },
  //     // });

  //     if (dto.appointmentId) {
  //       await this.prisma.appointment.update({
  //         where: { id: dto.appointmentId },
  //         data: {
  //           status: AppointmentStatus.IN_PROGRESS,
  //           // visitId removed - relation is now on Visit side
  //         },
  //       });
  //     }

  //     return newVisit;
  //   });

  //   return visit;
  // }

  /**
   * STEP 2: Start Examination (Move to IN_PROGRESS)
   */
  async startExamination(visitId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
    });
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.status !== VisitStatus.ARRIVED) {
      throw new BadRequestException(
        'Visit must be checked in to start examination',
      );
    }

    return this.prisma.visit.update({
      where: { id: visitId },
      data: {
        status: VisitStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });
  }

  /**
   * Get Complete Visit Dashboard - Everything for the clinical view
   */
  async getVisitDashboard(visitId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: {
        patient: {
          include: {
            insurances: { where: { status: 'ACTIVE' } },
          },
        },
        dentist: true,
        appointment: true,
        procedures: {
          include: { procedure: true },
          orderBy: { performedAt: 'desc' },
        },
        prescriptions: {
          include: {
            items: { include: { drug: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        imagingRecords: { orderBy: { takenAt: 'desc' } },
        labOrders: { orderBy: { createdAt: 'desc' } },
        // payments: true,
      },
    });

    if (!visit) throw new NotFoundException('Visit not found');

    // Get patient's previous visits for context
    const previousVisits = await this.prisma.visit.findMany({
      where: {
        patientId: visit.patientId,
        id: { not: visitId },
        status: 'COMPLETED',
      },
      include: {
        procedures: { include: { procedure: true }, take: 3 },
        prescriptions: { take: 1 },
      },
      orderBy: { completedAt: 'desc' },
      take: 3,
    });

    // Calculate running totals (procedure.cost is Decimal — coerce at boundary)
    const totalProcedures = visit.procedures.reduce(
      (sum, p) => sum + Number(p.cost),
      0,
    );
    // const totalPaid = visit.payments
    //   .filter((p) => p.status === 'COMPLETED')
    //   .reduce((sum, p) => sum + p.amount, 0);

    return {
      visit,
      previousVisits,
      financials: {
        proceduresTotal: totalProcedures,
        amountPaid: 0,
        balance: totalProcedures - 0,
        paymentStatus:
          0 >= totalProcedures ? 'PAID' : 0 > 0 ? 'PARTIALLY_PAID' : 'OPEN',
      },
      progress: this.calculateProgress(visit),
    };
  }

  /**
   * Update SOAP Notes (Auto-save friendly)
   */
  async updateSOAP(visitId: string, dto: UpdateClinicalNotesDto) {
    const data: Prisma.VisitUpdateInput = {};

    if (dto.chiefComplaint !== undefined)
      data.chiefComplaint = dto.chiefComplaint;
    if (dto.historyOfPresentIllness !== undefined)
      data.historyOfPresentIllness = dto.historyOfPresentIllness;
    if (dto.subjective !== undefined) data.subjective = dto.subjective;
    if (dto.objective !== undefined) data.objective = dto.objective;
    if (dto.assessment !== undefined) data.assessment = dto.assessment;
    if (dto.plan !== undefined) data.plan = dto.plan;
    if (dto.findings !== undefined) data.findings = dto.findings; // Add this
    if (dto.recommendations !== undefined)
      data.recommendations = dto.recommendations; // Add this

    return this.prisma.visit.update({
      where: { id: visitId },
      data,
      select: {
        chiefComplaint: true, // ← ADD
        historyOfPresentIllness: true,
        id: true,
        subjective: true,
        objective: true,
        assessment: true,
        plan: true,
        findings: true, // Add this
        recommendations: true, // Add this
        updatedAt: true,
      },
    });
  }

  /**
   * Update Vitals
   */
  async updateVitals(visitId: string, dto: UpdateVitalsDto) {
    return this.prisma.visit.update({
      where: { id: visitId },
      data: {
        bloodPressure: dto.bloodPressure,
        pulseRate: dto.pulseRate,
        temperature: dto.temperature,
        weight: dto.weight,
        height: dto.height,
        oxygenSat: dto.oxygenSat,
      },
    });
  }

  /**
   * Add Procedure to Visit
   */
  async addProcedure(visitId: string, dto: AddProcedureDto) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    const procedure = await this.prisma.visitProcedure.create({
      data: {
        visitId,
        procedureId: dto.procedureId,
        toothNumbers: dto.toothNumbers || [],
        surfaces: (dto.surfaces as any) || [],
        notes: dto.notes,
        cost: dto.cost,
      },
      include: { procedure: true },
    });

    // Update visit total cost
    await this.prisma.visit.update({
      where: { id: visitId },
      data: {
        totalCost: { increment: dto.cost },
      },
    });

    return procedure;
  }

  /**
   * Write Prescription
   */
  async writePrescription(visitId: string, dto: WritePrescriptionDto) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    if (!dto.items?.length) {
      throw new BadRequestException('At least one medication required');
    }

    return this.prisma.$transaction(async (tx) => {
      const code = await this.docNum.next('RX', tx); // RX-YY-NNNN
      return tx.prescription.create({
        data: {
          prescriptionCode: code,
          visitId,
          patientId: visit.patientId,
          dentistId: visit.dentistId,
          notes: dto.notes,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          items: { create: dto.items },
        },
        include: {
          items: { include: { drug: true } },
        },
      });
    });
  }

  /**
   * Process Payment (Can be done multiple times)
   */
  // async processPayment(visitId: string, dto: ProcessPaymentDto) {
  //   const visit = await this.prisma.visit.findUnique({
  //     where: { id: visitId },
  //   });
  //   if (!visit) throw new NotFoundException('Visit not found');

  //   const payment = await this.prisma.$transaction(async (tx) => {
  //     // Create payment record
  //     const newPayment = await tx.visitPayment.create({
  //       data: {
  //         visitId,
  //         amount: dto.amount,
  //         method: dto.method as any,
  //         reference: dto.reference,
  //         notes: dto.notes,
  //         status: 'COMPLETED',
  //       },
  //     });

  //     // Calculate new totals
  //     const currentAmountPaid = visit.amountPaid || 0;
  //     const newAmountPaid = currentAmountPaid + dto.amount;
  //     const totalCost = visit.totalCost || 0;
  //     const newBalance = totalCost - newAmountPaid;

  //     // Determine payment status using Prisma enum
  //     const paymentStatus: any = newBalance <= 0 ? 'PAID' : 'PENDING';

  //     // Update visit totals
  //     const updatedVisit = await tx.visit.update({
  //       where: { id: visitId },
  //       data: {
  //         amountPaid: newAmountPaid,
  //         paymentStatus: paymentStatus,
  //       },
  //     });

  //     return { payment: newPayment, visit: updatedVisit };
  //   });

  //   return payment;
  // }
  /**
   * Complete Visit
   */
  async completeVisit(visitId: string, dto: CompleteVisitDto) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: { appointment: true },
    });

    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.status !== VisitStatus.IN_PROGRESS) {
      throw new BadRequestException('Visit must be in progress to complete');
    }

    return this.prisma.$transaction(async (tx) => {
      // Complete the visit
      const completedVisit = await tx.visit.update({
        where: { id: visitId },
        data: {
          status: VisitStatus.COMPLETED,
          completedAt: new Date(),
          followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
          followUpNotes: dto.followUpNotes,
          recommendations: dto.recommendations,
        },
      });

      // Update appointment status
      if (visit.appointmentId) {
        await tx.appointment.update({
          where: { id: visit.appointmentId },
          data: {
            status: AppointmentStatus.COMPLETED,
            actualEndAt: new Date(),
            followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
          },
        });
      }

      return completedVisit;
    });
  }

  /**
   * Get Active Visits (For today's dashboard)
   */
  async getActiveVisits(date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    return this.prisma.visit.findMany({
      where: {
        checkedInAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: { in: ['ARRIVED', 'IN_PROGRESS'] },
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            patientCode: true,
            avatar: true,
          },
        },
        dentist: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        appointment: {
          select: {
            scheduledAt: true,
            type: true,
          },
        },
        _count: {
          select: {
            procedures: true,
            prescriptions: true,
          },
        },
      },
      orderBy: { checkedInAt: 'asc' },
    });
  }

  private calculateProgress(visit: any) {
    return {
      checkedIn: true,
      examinationStarted:
        visit.status === 'IN_PROGRESS' || visit.status === 'COMPLETED',
      vitalsRecorded: !!(
        visit.bloodPressure ||
        visit.pulseRate ||
        visit.temperature
      ),
      soapComplete: !!(
        visit.subjective &&
        visit.objective &&
        visit.assessment &&
        visit.plan
      ),
      proceduresRecorded: visit.procedures?.length > 0,
      prescriptionsWritten: visit.prescriptions?.length > 0,
      paymentProcessed: visit.amountPaid > 0,
      completed: visit.status === 'COMPLETED',
    };
  }

  /** @deprecated Visit codes are now issued by DocumentNumberService ('VIS'). */
  private async generateVisitCode(): Promise<string> {
    return this.docNum.next('VIS');
  }

  async getProcedures(query?: string) {
    const where: any = query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' as const } },
            { code: { contains: query, mode: 'insensitive' as const } },
          ],
          isActive: true,
        }
      : { isActive: true };

    return this.prisma.procedure.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async searchDrugs(query: string) {
    return this.prisma.drug.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' as const } },
          { genericName: { contains: query, mode: 'insensitive' as const } },
        ],
        isActive: true,
      },
      take: 20,
    });
  }

  /**
   * Get All Visits (List view with pagination)
   */
  async getAllVisits(params: {
    page?: number;
    limit?: number;
    status?: string;
    date?: string;
    patientId?: string;
    dentistId?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = params.page || 1;
    const limit = params.limit || 15;
    const skip = (page - 1) * limit;

    // Whitelisted sort columns — anything else falls back to checkedInAt so a
    // crafted ?sortBy= can never reach an unindexed/relation field or inject.
    const SAFE_SORT = new Set([
      'checkedInAt',
      'createdAt',
      'startedAt',
      'completedAt',
      'status',
      'visitCode',
    ]);
    const sortBy = SAFE_SORT.has(params.sortBy ?? '')
      ? (params.sortBy as string)
      : 'checkedInAt';
    const sortOrder: 'asc' | 'desc' = params.sortOrder === 'asc' ? 'asc' : 'desc';

    const where: any = {};

    // Filter by status
    if (params.status) {
      where.status = params.status;
    }

    // Filter by date (checkedInAt)
    if (params.date) {
      const startOfDay = new Date(params.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(params.date);
      endOfDay.setHours(23, 59, 59, 999);
      where.checkedInAt = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    // Filter by patient
    if (params.patientId) {
      where.patientId = params.patientId;
    }

    // Filter by dentist
    if (params.dentistId) {
      where.dentistId = params.dentistId;
    }

    // Search by patient name or visit code
    if (params.search) {
      where.OR = [
        {
          patient: {
            OR: [
              { firstName: { contains: params.search, mode: 'insensitive' } },
              { lastName: { contains: params.search, mode: 'insensitive' } },
              { patientCode: { contains: params.search, mode: 'insensitive' } },
            ],
          },
        },
        { visitCode: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [visits, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              patientCode: true,
              avatar: true,
            },
          },
          dentist: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialization: true,
            },
          },
          appointment: {
            select: {
              id: true,
              scheduledAt: true,
              type: true,
            },
          },
          _count: {
            select: {
              procedures: true,
              prescriptions: true,
              // payments: true,
            },
          },
        },
      }),
      this.prisma.visit.count({ where }),
    ]);

    return {
      data: visits,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getProgressReportsByPatient(patientId: string) {
    return this.prisma.progressReport.findMany({
      where: { patientId },
      include: {
        dentist: { select: { id: true, firstName: true, lastName: true } },
        visit: { select: { id: true, visitCode: true, startedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
