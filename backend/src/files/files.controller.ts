import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { StorageService } from '../storage/storage.service';
import { FileTokenService } from './file-token.service';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.pdf': 'application/pdf',
  '.dcm': 'application/dicom',
};

@Controller('files')
export class FilesController {
  constructor(
    private readonly storage: StorageService,
    private readonly fileTokens: FileTokenService,
  ) {}

  /**
   * Mint a short-lived token the browser can append to file URLs. Requires a
   * normal access token, so only a signed-in user can obtain one.
   */
  @Get('token')
  @UseGuards(JwtAuthGuard)
  issueToken(@Req() req: Request & { user?: { userId?: string; sub?: string } }) {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) throw new ForbiddenException('Not authenticated');
    return this.fileTokens.mint(userId);
  }

  /**
   * Stream an uploaded file. Replaces the unauthenticated static mount that
   * previously served /uploads: patient imaging now needs a valid signed token,
   * and is never cached by shared caches.
   */
  @Get('uploads/*path')
  @Public()
  async serve(
    @Param('path') segments: string[] | string,
    @Query('t') token: string | undefined,
    @Res() res: Response,
  ) {
    if (!this.fileTokens.verify(token)) {
      throw new ForbiddenException('A valid file token is required');
    }

    const relative = Array.isArray(segments) ? segments.join('/') : segments;
    const absolute = this.storage.resolveUploadPath(relative);
    if (!absolute) throw new NotFoundException('File not found');

    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat || !stat.isFile()) throw new NotFoundException('File not found');

    res.setHeader(
      'Content-Type',
      CONTENT_TYPES[path.extname(absolute).toLowerCase()] ??
        'application/octet-stream',
    );
    res.setHeader('Content-Length', stat.size);
    // Patient data: let the browser reuse it for the tab's lifetime only.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    createReadStream(absolute).pipe(res);
  }
}
