import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

/**
 * PHI-touching report types. Reads of these reports write one AuditLog row
 * per patient whose data was returned, so that "who read patient X's records?"
 * is queryable even after the report is gone.
 */
const PHI_TOUCHING_REPORT_TYPES = new Set<string>([
  'treatment_history',
  'procedure_sessions',
  'procedure_outcomes',
  'dental_chart_status',
  'diagnosis_trends',
  'patient_visits',
  'detailed',
  'patient',
  'patient_longitudinal',
]);

/**
 * Audit interceptor for report reads.
 *
 * For every successful report GET, write:
 *   1. One AuditLog row describing the report read (module, action, query, row count)
 *   2. One AuditLog row per patient ID returned (only for PHI-touching reports)
 *
 * For failed reads, write a single 'READ_FAILED' row.
 *
 * The write is fired-and-forget — never block the response on the audit log.
 * If the audit log write fails (DB down), we log to stderr but do not surface
 * the error to the user. Audit must never block reports.
 */
@Injectable()
export class ReportAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ReportAuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: (result) => {
          // Fire-and-forget — never await inside the response path
          setImmediate(() => {
            this.auditSuccess(req, result, Date.now() - start).catch((err) =>
              this.logger.error('Audit write failed', err?.stack || String(err)),
            );
          });
        },
        error: (err) => {
          setImmediate(() => {
            this.auditFailure(req, err).catch((auditErr) =>
              this.logger.error('Audit failure write failed', auditErr?.stack || String(auditErr)),
            );
          });
        },
      }),
    );
  }

  private async auditSuccess(req: any, result: any, durationMs: number): Promise<void> {
    const userId = req.user?.id ?? null;
    const userName = req.user
      ? `${req.user.firstName ?? ''} ${req.user.lastName ?? ''}`.trim() || req.user.email
      : null;
    const reportType =
      req.query?.type || this.inferReportTypeFromUrl(req.url) || 'unknown';
    const query = this.redactQuery(req.query);
    const queryHash = this.hashObject(query);
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      null;
    const userAgent = (req.headers['user-agent'] as string) || null;

    const patientIds = this.extractPatientIds(result);

    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          userName,
          action: 'READ',
          module: 'reports',
          entityType: 'Report',
          recordId: `${reportType}:${queryHash.slice(0, 16)}`,
          newData: JSON.parse(
            JSON.stringify({
              reportType,
              query,
              rowCount: Array.isArray(result?.data) ? result.data.length : null,
              durationMs,
              patientCount: patientIds.length,
            }),
          ) as Prisma.InputJsonValue,
          ipAddress,
          userAgent,
        },
      });

      // Per-patient audit for PHI reports
      if (PHI_TOUCHING_REPORT_TYPES.has(reportType) && patientIds.length > 0) {
        // Cap per-patient writes at 100 to avoid runaway audit volume on
        // large reports (e.g. patient-visits with 10k rows). The cap is
        // a defense-in-depth measure; reports should be paginated.
        const idsToAudit = patientIds.slice(0, 100);
        await this.prisma.auditLog.createMany({
          data: idsToAudit.map((pid) => ({
            userId,
            userName,
            action: 'READ_PATIENT_PHI',
            module: 'reports',
            entityType: 'Patient',
            recordId: pid,
            newData: { reportType, queryHash: queryHash.slice(0, 16) },
            ipAddress,
            userAgent,
          })),
        });
        if (patientIds.length > 100) {
          this.logger.warn(
            `Report ${reportType} returned ${patientIds.length} patients; only first 100 audited. Add pagination.`,
          );
        }
      }
    } catch (err) {
      this.logger.error('Audit success write failed', err?.stack || String(err));
      throw err;
    }
  }

  private async auditFailure(req: any, err: any): Promise<void> {
    const userId = req.user?.id ?? null;
    const userName = req.user?.email ?? null;
    const reportType =
      req.query?.type || this.inferReportTypeFromUrl(req.url) || 'unknown';
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.ip ||
      null;

    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          userName,
          action: 'READ_FAILED',
          module: 'reports',
          entityType: 'Report',
          recordId: `${reportType}:${Date.now()}`,
          newData: {
            reportType,
            error: err?.message || String(err),
            status: err?.status || 500,
          },
          ipAddress,
        },
      });
    } catch (auditErr) {
      this.logger.error('Audit failure write failed', auditErr?.stack || String(auditErr));
    }
  }

  private inferReportTypeFromUrl(url: string): string | null {
    const m = url?.match(/\/reports\/([^/?]+)/);
    return m ? m[1] : null;
  }

  private redactQuery(q: any): Record<string, unknown> {
    if (!q || typeof q !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(q)) {
      // Don't log raw PHI in the audit query blob
      if (k === 'search' && typeof v === 'string' && v.length > 64) {
        out[k] = v.slice(0, 64) + '…';
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  private hashObject(obj: unknown): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(obj))
      .digest('hex');
  }

  private extractPatientIds(result: any): string[] {
    if (!result) return [];
    const ids = new Set<string>();

    // Direct `data` array
    const rows: any[] = Array.isArray(result?.data) ? result.data : [];
    for (const r of rows) {
      if (typeof r?.patientId === 'string') ids.add(r.patientId);
      if (typeof r?.patient?.id === 'string') ids.add(r.patient.id);
    }

    // Patient summary list
    if (Array.isArray(result?.patients)) {
      for (const p of result.patients) {
        if (typeof p?.id === 'string') ids.add(p.id);
      }
    }

    return Array.from(ids);
  }
}
