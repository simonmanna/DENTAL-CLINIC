// src/common/filters/prisma-exception.filter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Maps Prisma's known DB errors to clean HTTP responses instead of leaking a
// raw 500 + stack. Most relevant here: the partial-unique index that stops
// duplicate LIVE diagnoses on a tooth (D1) now surfaces as a friendly 409
// rather than an opaque server error.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let mapped: HttpException;
    switch (exception.code) {
      case 'P2002': {
        // Unique constraint. Name the live-condition index specially so the
        // clinician gets an actionable message ("edit the existing finding").
        const target = String((exception.meta as any)?.target ?? '');
        mapped = target.includes('patient_conditions_live_unique')
          ? new ConflictException(
              'This diagnosis is already recorded as active on this tooth. ' +
                'Edit the existing finding instead of adding a duplicate.',
            )
          : new ConflictException(
              'A record with these unique values already exists.',
            );
        break;
      }
      case 'P2025': // record required but not found
        mapped = new NotFoundException(
          (exception.meta as any)?.cause ?? 'Record not found.',
        );
        break;
      case 'P2003': // foreign-key constraint failed
        mapped = new ConflictException(
          'Operation violates a reference constraint (related record missing or still in use).',
        );
        break;
      default:
        // Unknown known-error: log for forensics, return a generic 400 rather
        // than a 500 stack leak.
        this.logger.error(
          `Unmapped Prisma error ${exception.code}: ${exception.message}`,
        );
        mapped = new HttpException(
          'Database request could not be completed.',
          HttpStatus.BAD_REQUEST,
        );
    }

    const status = mapped.getStatus();
    res.status(status).json({
      statusCode: status,
      ...(typeof mapped.getResponse() === 'object'
        ? (mapped.getResponse() as object)
        : { message: mapped.getResponse() }),
      error: exception.code,
    });
  }
}
