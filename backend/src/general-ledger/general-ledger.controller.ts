import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GeneralLedgerService } from './general-ledger.service';
import { PostJournalDto } from './dto/post-journal.dto';
import { ReverseJournalDto } from './dto/reverse-journal.dto';
import {
  CreateLedgerAccountDto,
  UpdateLedgerAccountDto,
} from './dto/account.dto';
import { JournalStatus } from '@prisma/client';

@Controller('general-ledger')
@UseGuards(JwtAuthGuard)
export class GeneralLedgerController {
  constructor(private readonly gl: GeneralLedgerService) {}

  // ── Settings (optional accounting toggle) ───────────────────────────────────
  /** Whether automatic double-entry posting is currently on. */
  @Get('settings/auto-posting')
  async getAutoPosting() {
    return { enabled: await this.gl.isAutoPostingEnabled() };
  }

  /** Turn automatic double-entry posting on/off (effective immediately). */
  @Patch('settings/auto-posting')
  setAutoPosting(@Body() body: { enabled: boolean }) {
    return this.gl.setAutoPostingEnabled(!!body?.enabled);
  }

  // ── Chart of accounts ──────────────────────────────────────────────────────
  @Get('accounts')
  listAccounts() {
    return this.gl.listAccounts();
  }

  @Post('accounts/ensure')
  async ensureAccounts() {
    await this.gl.ensureCoreAccounts();
    return { ok: true };
  }

  @Post('accounts')
  createAccount(@Body() dto: CreateLedgerAccountDto) {
    return this.gl.createAccount(dto);
  }

  @Patch('accounts/:id')
  updateAccount(
    @Param('id') id: string,
    @Body() dto: UpdateLedgerAccountDto,
    @Request() req,
  ) {
    return this.gl.updateAccount(id, dto, req.user);
  }

  @Delete('accounts/:id')
  deleteAccount(@Param('id') id: string) {
    return this.gl.deleteAccount(id);
  }

  /** Account ledger (T-account) with running balance. */
  @Get('accounts/:code/ledger')
  accountLedger(
    @Param('code') code: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.gl.accountLedger({
      code,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // ── Reports ─────────────────────────────────────────────────────────────────
  @Get('trial-balance')
  trialBalance(@Query('asOf') asOf?: string) {
    return this.gl.trialBalance(asOf ? new Date(asOf) : undefined);
  }

  @Get('reports/income-statement')
  incomeStatement(@Query('from') from?: string, @Query('to') to?: string) {
    return this.gl.incomeStatement(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('reports/balance-sheet')
  balanceSheet(@Query('asOf') asOf?: string) {
    return this.gl.balanceSheet(asOf ? new Date(asOf) : undefined);
  }

  // ── Journal ────────────────────────────────────────────────────────────────
  @Get('journal')
  getJournal(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sourceType') sourceType?: string,
    @Query('sourceId') sourceId?: string,
    @Query('patientId') patientId?: string,
    @Query('status') status?: JournalStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.gl.getJournal({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      sourceType,
      sourceId,
      patientId,
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get('journal/:id')
  getEntry(@Param('id') id: string) {
    return this.gl.getEntry(id);
  }

  /** Manual general-journal posting (rent, salaries, corrections, …). */
  @Post('journal')
  postJournal(@Body() dto: PostJournalDto, @Request() req) {
    return this.gl.post({
      memo: dto.memo,
      date: dto.date ? new Date(dto.date) : undefined,
      sourceType: 'MANUAL',
      patientId: dto.patientId ?? null,
      postedById: req.user?.id ?? null,
      lines: dto.lines.map((l) => ({
        code: l.code,
        debit: l.debit,
        credit: l.credit,
        patientId: l.patientId,
        memo: l.memo,
      })),
    });
  }

  @Post('journal/:id/reverse')
  reverse(
    @Param('id') id: string,
    @Body() dto: ReverseJournalDto,
    @Request() req,
  ) {
    return this.gl.reverseEntry(id, dto.reason, req.user?.id ?? null);
  }
}
