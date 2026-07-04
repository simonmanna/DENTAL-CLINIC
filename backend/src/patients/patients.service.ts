// src/patients/patients.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePatientDto,
  UpdatePatientDto,
  PatientQueryDto,
  CreateInsuranceDto,
} from './dto/patient.dto';
import {
  PatientReportQueryDto,
  ReportPeriod,
  PatientSummaryReport,
  TrendDataPoint,
  GenderDataPoint,
  AgeGroupDataPoint,
  StatusDataPoint,
  InsuranceDataPoint,
  CityDataPoint,
  GrowthDataPoint,
  PatientFullReport,
} from './dto/report-query.dto'; // Adjust path if needed
import { Prisma } from '@prisma/client';
import { DocumentNumberService } from '../common/document-number/document-number.service';

// ─── Date helpers (from reports service) ─────────────────────────────────
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return startOfDay(new Date(d.setDate(diff)));
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfLastMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}
function endOfLastMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
}
function startOfLastWeek(d: Date): Date {
  const s = startOfWeek(new Date(d));
  s.setDate(s.getDate() - 7);
  return s;
}
function endOfLastWeek(d: Date): Date {
  const e = startOfWeek(new Date(d));
  e.setDate(e.getDate() - 1);
  e.setHours(23, 59, 59, 999);
  return e;
}
function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private docNum: DocumentNumberService,
  ) {}

  // ──────────────────────────────────
  // Existing patient CRUD + business methods
  // ──────────────────────────────────

  async create(dto: CreatePatientDto) {
    // PAT-YY-NNNN, generated atomically inside the create transaction.
    return this.prisma.$transaction(async (tx) => {
      const patientCode = await this.docNum.next('PAT', tx);
      return tx.patient.create({
        data: {
          ...dto,
          patientCode,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          allergies: dto.allergies || [],
          medicalConditions: dto.medicalConditions || [],
          currentMedications: dto.currentMedications || [],
        },
        include: {
          insurances: true,
          _count: { select: { appointments: true, treatmentPlans: true } },
        },
      });
    });
  }

  private buildWhere(query: PatientQueryDto): Prisma.PatientWhereInput {
    const { search, gender, isActive, ageMin, ageMax, dateFrom, dateTo } =
      query;

    const where: Prisma.PatientWhereInput = {
      ...(isActive !== undefined && { isActive }),
      ...(gender && { gender: gender as any }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { patientCode: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    // Registered-at range
    if (dateFrom || dateTo) {
      where.registeredAt = {};
      if (dateFrom) where.registeredAt.gte = new Date(dateFrom);
      if (dateTo) where.registeredAt.lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    // Age → dateOfBirth inversion
    if (ageMin !== undefined || ageMax !== undefined) {
      const now = new Date();
      where.dateOfBirth = {};
      if (ageMax !== undefined) {
        const maxDob = new Date(
          now.getFullYear() - ageMax,
          now.getMonth(),
          now.getDate(),
        );
        where.dateOfBirth.gte = maxDob; // younger = born later
      }
      if (ageMin !== undefined) {
        const minDob = new Date(
          now.getFullYear() - ageMin,
          now.getMonth(),
          now.getDate(),
        );
        where.dateOfBirth.lte = minDob; // older = born earlier
      }
    }

    return where;
  }

  // ══════════════════════════════════════════
  // Enhanced findAll (replace existing)
  // ══════════════════════════════════════════
  async findAll(query: PatientQueryDto) {
    const where = this.buildWhere(query);
    const page = parseInt(query.page as any, 10) || 1;
    const limit = parseInt(query.limit as any, 10) || 15;
    const skip = (page - 1) * limit;
    const { sortBy, sortOrder } = query;

    // Dynamic Prisma sorting
    let orderBy: any = { registeredAt: sortOrder || 'desc' };
    switch (sortBy) {
      case 'name':
        orderBy = { firstName: sortOrder };
        break;
      case 'registeredAt':
        orderBy = { registeredAt: sortOrder };
        break;
      case 'age':
        orderBy = { dateOfBirth: sortOrder === 'asc' ? 'desc' : 'asc' };
        break;
      case 'gender':
        orderBy = { gender: sortOrder };
        break;
      case 'visits':
        orderBy = { emrRecords: { _count: sortOrder } };
        break;
      case 'appointments':
        orderBy = { appointments: { _count: sortOrder } };
        break;
      default:
        orderBy = { registeredAt: 'desc' };
    }

    const [total, patients] = await Promise.all([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          insurances: { select: { provider: true, status: true } },
          // Latest appointment → assigned doctor
          appointments: {
            orderBy: { scheduledAt: 'desc' },
            take: 1,
            select: {
              dentist: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
          _count: {
            select: { appointments: true, emrRecords: true },
          },
        },
      }),
    ]);

    return {
      data: patients,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ══════════════════════════════════════════
  // NEW: Analytics for the report header
  // ══════════════════════════════════════════

  // ══════════════════════════════════════════
  // NEW: Analytics for the report header (FIXED)
  // ══════════════════════════════════════════
  async getPatientAnalytics(query: PatientQueryDto) {
    const where = this.buildWhere(query);

    const [total, male, female, newThisMonth, avgAgeResult] = await Promise.all(
      [
        this.prisma.patient.count({ where }),
        this.prisma.patient.count({ where: { ...where, gender: 'MALE' } }),
        this.prisma.patient.count({ where: { ...where, gender: 'FEMALE' } }),
        this.prisma.patient.count({
          where: {
            ...where,
            registeredAt: { gte: startOfMonth(new Date()) },
          },
        }),
        // Raw query because Prisma _avg does not support DateTime fields
        this.prisma.$queryRaw<{ avg_age: number }[]>`
        SELECT COALESCE(AVG(EXTRACT(YEAR FROM AGE(NOW(), "dateOfBirth"))), 0)::int as avg_age
        FROM patients
        WHERE "dateOfBirth" IS NOT NULL
          ${
            query.search
              ? Prisma.sql` AND (
            "firstName" ILIKE ${'%' + query.search + '%'} OR 
            "lastName"  ILIKE ${'%' + query.search + '%'} OR 
            "patientCode" ILIKE ${'%' + query.search + '%'} OR 
            "phone" ILIKE ${'%' + query.search + '%'} OR 
            "email" ILIKE ${'%' + query.search + '%'}
          )`
              : Prisma.empty
          }
          ${query.gender ? Prisma.sql` AND "gender" = ${query.gender}` : Prisma.empty}
          ${query.isActive !== undefined ? Prisma.sql` AND "isActive" = ${query.isActive}` : Prisma.empty}
          ${query.dateFrom ? Prisma.sql` AND "registeredAt" >= ${new Date(query.dateFrom)}` : Prisma.empty}
          ${query.dateTo ? Prisma.sql` AND "registeredAt" <= ${new Date(query.dateTo + 'T23:59:59.999Z')}` : Prisma.empty}
          ${query.ageMin !== undefined ? Prisma.sql` AND "dateOfBirth" <= ${new Date(new Date().getFullYear() - query.ageMin, new Date().getMonth(), new Date().getDate())}` : Prisma.empty}
          ${query.ageMax !== undefined ? Prisma.sql` AND "dateOfBirth" >= ${new Date(new Date().getFullYear() - query.ageMax, new Date().getMonth(), new Date().getDate())}` : Prisma.empty}
      `,
      ],
    );

    const avgAge = Number(avgAgeResult[0]?.avg_age ?? 0);

    return { total, male, female, avgAge, newThisMonth };
  }
  // async getPatientAnalytics(query: PatientQueryDto) {
  //   const where = this.buildWhere(query);

  //   const [total, male, female, newThisMonth, avgDobAgg] = await Promise.all([
  //     this.prisma.patient.count({ where }),
  //     this.prisma.patient.count({ where: { ...where, gender: 'MALE' } }),
  //     this.prisma.patient.count({ where: { ...where, gender: 'FEMALE' } }),
  //     this.prisma.patient.count({
  //       where: {
  //         ...where,
  //         registeredAt: { gte: startOfMonth(new Date()) },
  //       },
  //     }),
  //     this.prisma.patient.aggregate({
  //       where: { ...where, dateOfBirth: { not: null } },
  //       _avg: { dateOfBirth: true },
  //     }),
  //   ]);

  //   // Approximate average age from average DOB (good enough for dashboard KPIs)
  //   const avgDob = avgDobAgg._avg.dateOfBirth;
  //   const avgAge = avgDob
  //     ? Math.floor((Date.now() - new Date(avgDob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  //     : 0;

  //   return { total, male, female, avgAge, newThisMonth };
  // }

  // async findAll(query: PatientQueryDto) {
  //   const { search, gender, isActive } = query;
  //   const page = parseInt(query.page as any, 10) || 1;
  //   const limit = parseInt(query.limit as any, 10) || 15;
  //   const skip = (page - 1) * limit;

  //   const where: Prisma.PatientWhereInput = {
  //     ...(isActive !== undefined && { isActive }),
  //     ...(gender && { gender: gender as any }),
  //     ...(search && {
  //       OR: [
  //         { firstName: { contains: search, mode: 'insensitive' } },
  //         { lastName: { contains: search, mode: 'insensitive' } },
  //         { patientCode: { contains: search, mode: 'insensitive' } },
  //         { phone: { contains: search } },
  //         { email: { contains: search, mode: 'insensitive' } },
  //       ],
  //     }),
  //   };

  //   const [total, patients] = await Promise.all([
  //     this.prisma.patient.count({ where }),
  //     this.prisma.patient.findMany({
  //       where,
  //       skip,
  //       take: limit,
  //       orderBy: { createdAt: 'desc' },
  //       include: {
  //         insurances: { select: { provider: true, status: true } },
  //         _count: { select: { appointments: true, treatmentPlans: true } },
  //       },
  //     }),
  //   ]);

  //   return {
  //     data: patients,
  //     meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  //   };
  // }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        insurances: true,
        documents: true,
        appointments: {
          orderBy: { scheduledAt: 'desc' },
          take: 5,
          include: { dentist: { include: { user: true } } },
        },
        treatmentPlans: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
        emrRecords: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: { dentist: true },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            invoiceNumber: true,
            total: true,
            status: true,
            createdAt: true,
            amountPaid: true,
            currency: true,
          },
        },
        familyGroup: {
          include: {
            patients: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                patientCode: true,
              },
            },
          },
        },
        _count: {
          select: {
            appointments: true,
            treatmentPlans: true,
            emrRecords: true,
            invoices: true,
          },
        },
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async update(id: string, dto: UpdatePatientDto) {
    await this.findOne(id);
    const data: Prisma.PatientUpdateInput = {};

    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.dateOfBirth !== undefined) {
      data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }
    if (dto.previousCardNumber !== undefined)
      data.previousCardNumber = dto.previousCardNumber;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.alternatePhone !== undefined)
      data.alternatePhone = dto.alternatePhone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.occupation !== undefined) data.occupation = dto.occupation;
    if (dto.bloodGroup !== undefined) data.bloodGroup = dto.bloodGroup;

    if (dto.allergies !== undefined) data.allergies = dto.allergies;
    if (dto.medicalConditions !== undefined)
      data.medicalConditions = dto.medicalConditions;
    if (dto.currentMedications !== undefined)
      data.currentMedications = dto.currentMedications;

    if (dto.emergencyContactName !== undefined)
      data.emergencyContactName = dto.emergencyContactName;
    if (dto.emergencyContactPhone !== undefined)
      data.emergencyContactPhone = dto.emergencyContactPhone;
    if (dto.emergencyContactRelation !== undefined)
      data.emergencyContactRelation = dto.emergencyContactRelation;

    if (dto.familyRole !== undefined) data.familyRole = dto.familyRole;

    return this.prisma.patient.update({
      where: { id },
      data,
      include: {
        insurances: true,
        _count: { select: { appointments: true, treatmentPlans: true } },
      },
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.patient.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getVisitHistory(id: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [total, records] = await Promise.all([
      this.prisma.appointment.count({ where: { patientId: id } }),
      this.prisma.appointment.findMany({
        where: { patientId: id },
        skip,
        take: limit,
        orderBy: { scheduledAt: 'desc' },
        include: {
          dentist: { select: { firstName: true, lastName: true } },
          emrRecord: { select: { assessment: true, plan: true } },
          invoices: { select: { total: true, status: true } },
        },
      }),
    ]);
    return { data: records, meta: { total, page, limit } };
  }

  async addInsurance(patientId: string, dto: CreateInsuranceDto) {
    await this.findOne(patientId);
    return this.prisma.patientInsurance.create({
      data: {
        ...dto,
        patientId,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      },
    });
  }

  async addDocument(
    patientId: string,
    document: {
      name: string;
      type: string;
      fileUrl: string;
      fileSize?: number;
      mimeType?: string;
    },
  ) {
    await this.findOne(patientId);
    return this.prisma.patientDocument.create({
      data: { ...document, patientId },
    });
  }

  async getStats() {
    const [total, active, today, thisMonth] = await Promise.all([
      this.prisma.patient.count(),
      this.prisma.patient.count({ where: { isActive: true } }),
      this.prisma.patient.count({
        where: {
          registeredAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      this.prisma.patient.count({
        where: {
          registeredAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);
    return { total, active, today, thisMonth };
  }

  /** @deprecated Patient codes are now issued by DocumentNumberService ('PAT'). */
  private async generatePatientCode(): Promise<string> {
    return this.docNum.next('PAT');
  }

  // ══════════════════════════════════════════
  // Integrated reporting methods
  // ══════════════════════════════════════════

  // 1. Summary KPIs
  async getPatientSummary(): Promise<PatientSummaryReport> {
    const now = new Date();

    const [
      total,
      active,
      today,
      thisWeek,
      thisMonth,
      lastMonthCount,
      lastWeekCount,
    ] = await Promise.all([
      this.prisma.patient.count(),
      this.prisma.patient.count({ where: { isActive: true } }),
      this.prisma.patient.count({
        where: { registeredAt: { gte: startOfDay(new Date()) } },
      }),
      this.prisma.patient.count({
        where: { registeredAt: { gte: startOfWeek(new Date()) } },
      }),
      this.prisma.patient.count({
        where: { registeredAt: { gte: startOfMonth(new Date()) } },
      }),
      this.prisma.patient.count({
        where: {
          registeredAt: {
            gte: startOfLastMonth(now),
            lte: endOfLastMonth(now),
          },
        },
      }),
      this.prisma.patient.count({
        where: {
          registeredAt: {
            gte: startOfLastWeek(now),
            lte: endOfLastWeek(now),
          },
        },
      }),
    ]);

    const inactive = total - active;

    const newVsLastMonth =
      lastMonthCount === 0
        ? 100
        : Math.round(((thisMonth - lastMonthCount) / lastMonthCount) * 1000) /
          10;

    const newVsLastWeek =
      lastWeekCount === 0
        ? 100
        : Math.round(((thisWeek - lastWeekCount) / lastWeekCount) * 1000) / 10;

    return {
      total,
      active,
      inactive,
      today,
      thisWeek,
      thisMonth,
      newVsLastMonth,
      newVsLastWeek,
      activeRate: pct(active, total),
    };
  }

  // 2. Registration trends
  async getRegistrationTrends(
    period: ReportPeriod = ReportPeriod.MONTHLY,
    startDate?: Date,
    endDate?: Date,
  ): Promise<TrendDataPoint[]> {
    const end = endDate ?? new Date();
    let start = startDate ?? new Date();

    if (!startDate) {
      if (period === ReportPeriod.DAILY) {
        start = new Date(end);
        start.setDate(end.getDate() - 30);
      }
      if (period === ReportPeriod.WEEKLY) {
        start = new Date(end);
        start.setDate(end.getDate() - 84);
      }
      if (period === ReportPeriod.MONTHLY) {
        start = new Date(end);
        start.setMonth(end.getMonth() - 11);
        start.setDate(1);
      }
    }

    const trunc =
      period === ReportPeriod.DAILY
        ? 'day'
        : period === ReportPeriod.WEEKLY
          ? 'week'
          : 'month';

    const rows = await this.prisma.$queryRaw<
      { period_key: Date; new_count: bigint }[]
    >`
      SELECT
        DATE_TRUNC(${trunc}, "registeredAt") AS period_key,
        COUNT(*)::int AS new_count
      FROM patients
      WHERE "registeredAt" BETWEEN ${start} AND ${end}
      GROUP BY period_key
      ORDER BY period_key ASC
    `;

    const returnRows = await this.prisma.$queryRaw<
      { period_key: Date; ret_count: bigint }[]
    >`
      SELECT
        DATE_TRUNC(${trunc}, a."scheduledAt") AS period_key,
        COUNT(DISTINCT a."patientId")::int AS ret_count
      FROM appointments a
      JOIN patients p ON p.id = a."patientId"
      WHERE a."scheduledAt" BETWEEN ${start} AND ${end}
        AND p."registeredAt" < ${start}
      GROUP BY period_key
      ORDER BY period_key ASC
    `;

    const retMap = new Map(
      returnRows.map((r) => [r.period_key.toISOString(), Number(r.ret_count)]),
    );

    return rows.map((r) => {
      const key = r.period_key.toISOString();
      const newCount = Number(r.new_count);
      const retCount = retMap.get(key) ?? 0;
      const label = this.formatPeriodLabel(r.period_key, period);
      const shortKey = this.formatPeriodKey(r.period_key, period);

      return {
        period: shortKey,
        label,
        new: newCount,
        returning: retCount,
        total: newCount + retCount,
      };
    });
  }

  // 3. Gender distribution
  async getGenderDistribution(): Promise<GenderDataPoint[]> {
    const rows = await this.prisma.patient.groupBy({
      by: ['gender'],
      _count: { gender: true },
      orderBy: { _count: { gender: 'desc' } },
    });

    const total = rows.reduce((s, r) => s + r._count.gender, 0);

    return rows.map((r) => ({
      gender: r.gender ?? 'UNKNOWN',
      count: r._count.gender,
      pct: pct(r._count.gender, total),
    }));
  }

  // 4. Age group distribution

  // 4. Age group distribution
  async getAgeGroupDistribution(): Promise<AgeGroupDataPoint[]> {
    const rows = await this.prisma.$queryRaw<
      { age_group: string; count: number }[]
    >`
      WITH age_calc AS (
        SELECT
          EXTRACT(YEAR FROM AGE(NOW(), "dateOfBirth"))::int AS age_years
        FROM patients
        WHERE "dateOfBirth" IS NOT NULL
      ),
      grouped AS (
        SELECT
          CASE
            WHEN age_years < 13              THEN '0–12'
            WHEN age_years BETWEEN 13 AND 17 THEN '13–17'
            WHEN age_years BETWEEN 18 AND 30 THEN '18–30'
            WHEN age_years BETWEEN 31 AND 45 THEN '31–45'
            WHEN age_years BETWEEN 46 AND 60 THEN '46–60'
            ELSE '60+'
          END AS age_group
        FROM age_calc
      )
      SELECT
        age_group,
        COUNT(*)::int AS count
      FROM grouped
      GROUP BY age_group
      ORDER BY
        CASE age_group
          WHEN '0–12'  THEN 1
          WHEN '13–17' THEN 2
          WHEN '18–30' THEN 3
          WHEN '31–45' THEN 4
          WHEN '46–60' THEN 5
          ELSE 6
        END
    `;

    const withDob = rows.reduce((s, r) => s + Number(r.count), 0);
    const total = await this.prisma.patient.count();
    const unknown = total - withDob;

    const result: AgeGroupDataPoint[] = rows.map((r) => ({
      group: r.age_group,
      count: Number(r.count),
      pct: pct(Number(r.count), total),
    }));

    if (unknown > 0) {
      result.push({
        group: 'Unknown',
        count: unknown,
        pct: pct(unknown, total),
      });
    }

    return result;
  }

  async getStatusDistribution(): Promise<StatusDataPoint[]> {
    const [active, total] = await Promise.all([
      this.prisma.patient.count({ where: { isActive: true } }),
      this.prisma.patient.count(),
    ]);
    const inactive = total - active;
    return [
      { status: 'Active', count: active, pct: pct(active, total) },
      { status: 'Inactive', count: inactive, pct: pct(inactive, total) },
    ];
  }

  // 6. Insurance breakdown
  async getInsuranceDistribution(): Promise<InsuranceDataPoint[]> {
    const rows = await this.prisma.$queryRaw<
      { status: string; count: number }[]
    >`
      SELECT
        COALESCE(ins.status::text, 'NONE') AS status,
        COUNT(DISTINCT p.id)::int AS count
      FROM patients p
      LEFT JOIN LATERAL (
        SELECT status
        FROM patient_insurance
        WHERE "patientId" = p.id
        ORDER BY
          CASE status
            WHEN 'ACTIVE'  THEN 1
            WHEN 'PENDING' THEN 2
            WHEN 'EXPIRED' THEN 3
            ELSE 4
          END
        LIMIT 1
      ) ins ON true
      GROUP BY ins.status
      ORDER BY count DESC
    `;

    const total = rows.reduce((s, r) => s + Number(r.count), 0);
    const labelMap: Record<string, string> = {
      ACTIVE: 'Insured',
      PENDING: 'Pending',
      EXPIRED: 'Expired',
      NONE: 'Uninsured',
    };

    return rows.map((r) => ({
      status: labelMap[r.status] ?? r.status,
      count: Number(r.count),
      pct: pct(Number(r.count), total),
    }));
  }

  // 7. City distribution
  async getCityDistribution(topN = 8): Promise<CityDataPoint[]> {
    const rows = await this.prisma.patient.groupBy({
      by: ['city'],
      _count: { city: true },
      orderBy: { _count: { city: 'desc' } },
      take: topN + 1,
    });

    const total = await this.prisma.patient.count();
    const knownRows = rows.filter((r) => r.city != null);
    const unknownCount =
      total - knownRows.reduce((s, r) => s + r._count.city, 0);

    const result: CityDataPoint[] = knownRows.slice(0, topN).map((r) => ({
      city: r.city!,
      count: r._count.city,
      pct: pct(r._count.city, total),
    }));

    if (unknownCount > 0) {
      result.push({
        city: 'Other / Unknown',
        count: unknownCount,
        pct: pct(unknownCount, total),
      });
    }

    return result;
  }

  // 8. Month-over-month growth
  async getGrowthRate(months = 12): Promise<GrowthDataPoint[]> {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - months + 1, 1);

    const rows = await this.prisma.$queryRaw<
      { period_key: Date; new_count: number }[]
    >`
      SELECT
        DATE_TRUNC('month', "registeredAt") AS period_key,
        COUNT(*)::int AS new_count
      FROM patients
      WHERE "registeredAt" >= ${start}
      GROUP BY period_key
      ORDER BY period_key ASC
    `;

    return rows.map((r, i) => {
      const prev = i > 0 ? Number(rows[i - 1].new_count) : null;
      const cur = Number(r.new_count);
      const growthPct =
        prev == null
          ? 0
          : prev === 0
            ? 100
            : Math.round(((cur - prev) / prev) * 1000) / 10;

      return {
        period: this.formatPeriodKey(r.period_key, ReportPeriod.MONTHLY),
        label: this.formatPeriodLabel(r.period_key, ReportPeriod.MONTHLY),
        new: cur,
        previous: prev ?? 0,
        growthPct,
      };
    });
  }

  // 9. Full combined report
  async getFullPatientReport(
    query: PatientReportQueryDto,
  ): Promise<PatientFullReport> {
    const period = query.period ?? ReportPeriod.MONTHLY;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    const [
      summary,
      trends,
      gender,
      ageGroups,
      status,
      insurance,
      cities,
      growth,
    ] = await Promise.all([
      this.getPatientSummary(),
      this.getRegistrationTrends(period, startDate, endDate),
      this.getGenderDistribution(),
      this.getAgeGroupDistribution(),
      this.getStatusDistribution(),
      this.getInsuranceDistribution(),
      this.getCityDistribution(),
      this.getGrowthRate(),
    ]);

    return {
      summary,
      trends,
      gender,
      ageGroups,
      status,
      insurance,
      cities,
      growth,
      generatedAt: new Date().toISOString(),
    };
  }

  // ══════════════════════════════════════════
  // Formatting helpers (copied from reports service)
  // ══════════════════════════════════════════
  private formatPeriodKey(date: Date, period: ReportPeriod): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    if (period === ReportPeriod.DAILY) return `${y}-${m}-${d}`;
    if (period === ReportPeriod.WEEKLY) {
      const week = this.getISOWeek(date);
      return `${y}-W${String(week).padStart(2, '0')}`;
    }
    return `${y}-${m}`;
  }

  private formatPeriodLabel(date: Date, period: ReportPeriod): string {
    if (period === ReportPeriod.DAILY) {
      return date.toLocaleDateString('en-UG', {
        day: 'numeric',
        month: 'short',
      });
    }
    if (period === ReportPeriod.WEEKLY) {
      return `W${this.getISOWeek(date)} '${String(date.getFullYear()).slice(2)}`;
    }
    return date.toLocaleDateString('en-UG', {
      month: 'short',
      year: '2-digit',
    });
  }

  private getISOWeek(date: Date): number {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const year = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - year.getTime()) / 86400000 + 1) / 7);
  }
}
