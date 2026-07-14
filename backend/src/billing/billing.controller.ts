import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { BillingService } from './billing.service';
import { LedgerService } from './ledger.service';
import { InvoicesService } from './invoices.service';
import { InvoiceLifecycleService } from './invoice-lifecycle.service';
import { CurrencyService } from './currency.service';
import {
  CreateLedgerEntryDto,
  CreateInvoiceFromLedgerDto,
  AddInvoicePaymentDto,
  RefundInvoicePaymentDto,
  VoidLedgerEntryDto,
  CurrencyConversionDto,
  CreateDraftInvoiceDto,
  AddEncounterItemDto,
  ActivateInvoiceDto,
  VoidInvoiceDto,
} from './dto/billing.dto';
import {
  CreateBillingServiceDto,
  UpdateBillingServiceDto,
  QueryBillingServiceDto,
} from './dto/billing-service.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

// ── Role aliases used across this controller ──────────────────────────────────
// CASHIER does not exist in the UserRole enum (SUPER_ADMIN, ADMIN, DENTIST,
// NURSE, RECEPTIONIST, PHARMACIST, LAB_TECHNICIAN). Cashier-like duties fall
// to ADMIN or RECEPTIONIST in this codebase.
const ADMIN_ONLY = [UserRole.SUPER_ADMIN, UserRole.ADMIN];
const CAN_RECORD_PAYMENT = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.DENTIST,
  UserRole.RECEPTIONIST,
];
const CAN_CREATE_INVOICE = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.RECEPTIONIST,
];
const CAN_CREATE_LEDGER = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.DENTIST,
];
const CAN_CREATE_PRESCRIPTION_LEDGER = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PHARMACIST,
];
const CAN_EDIT_INVOICE = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.RECEPTIONIST,
];
// C3: patient ledger / invoice / receipt reads expose financial PII. Gate them
// to billing-capable roles (incl. DENTIST, who needs to see their patient's
// charges) and keep clinical-only roles (NURSE / PHARMACIST / LAB_TECHNICIAN)
// out of the cash book. Cross-patient access within these roles is intentional;
// per-clinic tenant isolation is a separate (schema-level) follow-up.
const CAN_VIEW_BILLING = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.RECEPTIONIST,
  UserRole.DENTIST,
];

@Controller('billing')
export class BillingController {
  constructor(
    private billing: BillingService,
    private ledger: LedgerService,
    private invoices: InvoicesService,
    private lifecycle: InvoiceLifecycleService,
    private currency: CurrencyService,
  ) {}

  // ── Currency Utilities ──────────────────────────────────────────

  @Get('currencies/rate')
  async getExchangeRate(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('date') date?: string,
  ) {
    const rate = await this.currency.getExchangeRate(
      from,
      to,
      date ? new Date(date) : undefined,
    );
    return { from, to, rate, date: date || new Date().toISOString() };
  }

  @Post('currencies/convert')
  async convertCurrency(@Body() dto: CurrencyConversionDto) {
    return this.currency.convert(
      dto.amount,
      dto.fromCurrency,
      dto.toCurrency,
      dto.exchangeRate,
      dto.date ? new Date(dto.date) : undefined,
    );
  }

  @Get('currencies/base')
  getBaseCurrency() {
    return { baseCurrency: this.currency.getBaseCurrency() };
  }

  // P0: Setting the system exchange rate affects every future conversion.
  // Restrict to admins — anyone with auth could otherwise rig FX for refunds.
  @Post('currencies/rate')
  @Roles(...ADMIN_ONLY)
  async setExchangeRate(
    @Body() dto: { from: string; to: string; rate: number; source?: string },
  ) {
    await this.currency.setExchangeRate(dto.from, dto.to, dto.rate, dto.source);
    return { success: true, from: dto.from, to: dto.to, rate: dto.rate };
  }

  // ── Billing Services (Service Catalogue) ──────────────────────

  @Get('services')
  async getServices(@Query() query: QueryBillingServiceDto) {
    const services = await this.billing.findAllServices(query);
    return { data: services };
  }

  @Get('services/:id')
  async getService(@Param('id', ParseUUIDPipe) id: string) {
    const service = await this.billing.findServiceById(id);
    return { data: service };
  }

  // P0: catalogue management is admin work — restrict catalogue writes.
  @Post('services')
  @Roles(...ADMIN_ONLY)
  async createService(@Body() dto: CreateBillingServiceDto) {
    const service = await this.billing.createService(dto);
    return { data: service };
  }

  @Patch('services/:id')
  @Roles(...ADMIN_ONLY)
  async updateService(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBillingServiceDto,
  ) {
    const service = await this.billing.updateService(id, dto);
    return { data: service };
  }

  // P0: hard-deleting a service is destructive — admin only.
  @Delete('services/:id')
  @Roles(...ADMIN_ONLY)
  async deleteService(@Param('id', ParseUUIDPipe) id: string) {
    const service = await this.billing.deleteService(id);
    return { data: service };
  }

  // "Favourite" toggling is a per-user UI preference — safe for any authed user.
  @Patch('services/:id/favorite')
  async toggleServiceFavorite(@Param('id', ParseUUIDPipe) id: string) {
    const service = await this.billing.toggleServiceFavorite(id);
    return { data: service };
  }

  // ── Ledger ──────────────────────────────────────────────────────

  @Get('ledger')
  @Roles(...CAN_VIEW_BILLING)
  getLedger(
    @Query('patientId') patientId?: string,
    @Query('visitId') visitId?: string,
    @Query('status') status?: string,
    @Query('currency') currency?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ledger.getPatientLedger({
      patientId,
      visitId,
      status,
      currency,
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
    });
  }

  // Clinical staff create ledger entries for procedures they performed.
  @Post('ledger')
  @Roles(...CAN_CREATE_LEDGER)
  createLedgerEntry(@Body() dto: CreateLedgerEntryDto) {
    return this.ledger.createEntry(dto);
  }

  // P0: voiding a ledger entry removes its revenue contribution — admin only.
  @Patch('ledger/:id/void')
  @Roles(...ADMIN_ONLY)
  voidLedgerEntry(@Param('id') id: string, @Body() dto: VoidLedgerEntryDto) {
    return this.ledger.voidEntry(id, dto.reason);
  }

  // ── Invoices ────────────────────────────────────────────────────

  @Get('invoices')
  @Roles(...CAN_VIEW_BILLING)
  getInvoices(
    @Query('patientId') patientId?: string,
    @Query('visitId') visitId?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('currency') currency?: string,
    @Query('baseCurrency') baseCurrency?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('dentistId') dentistId?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'total' | 'balance' | 'invoiceNumber',
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.invoices.getPatientInvoices({
      patientId,
      visitId,
      status,
      paymentStatus,
      currency,
      baseCurrency,
      search,
      dateFrom,
      dateTo,
      dentistId,
      sortBy,
      sortDir,
      page: page ? +page : 1,
      limit: limit ? +limit : 25,
    });
  }

  @Post('invoices/from-ledger')
  @Roles(...CAN_CREATE_INVOICE)
  createInvoiceFromLedger(
    @Body() dto: CreateInvoiceFromLedgerDto,
    @CurrentUser('id') currentUserId: string | undefined,
  ) {
    return this.invoices.createFromLedger(dto, currentUserId);
  }

  @Get('invoices/:id')
  @Roles(...CAN_VIEW_BILLING)
  getInvoice(@Param('id') id: string) {
    return this.invoices.getInvoice(id);
  }

  @Post('invoices/:id/items')
  @Roles(...CAN_EDIT_INVOICE)
  addInvoiceItem(
    @Param('id') id: string,
    @Body()
    item: {
      description: string;
      quantity: number;
      unitPrice: number;
      discount?: number;
      currency?: string;
      exchangeRate?: number;
    },
  ) {
    return this.invoices.addItem(id, item);
  }

  @Delete('invoices/:id/items/:itemId')
  @Roles(...CAN_EDIT_INVOICE)
  removeInvoiceItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.invoices.removeItem(id, itemId);
  }

  // Cashier-like work — admin or receptionist.
  // C1: an `Idempotency-Key` header makes a double-click / retry safe — the
  // service replays the first result instead of recording a second payment.
  @Post('invoices/:id/payments')
  @Roles(...CAN_RECORD_PAYMENT)
  addPayment(
    @Param('id') id: string,
    @Body() dto: AddInvoicePaymentDto,
    @CurrentUser('id') currentUserId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.invoices.addPayment(id, dto, currentUserId, idempotencyKey);
  }

  // P0: refunds move money OUT — admin only.
  @Post('invoices/:id/refunds')
  @Roles(...ADMIN_ONLY)
  refundPayment(
    @Param('id') id: string,
    @Body() dto: RefundInvoicePaymentDto,
    @CurrentUser('id') currentUserId: string | undefined,
  ) {
    return this.invoices.refundPayment(id, dto, currentUserId);
  }

  // P0: voiding an invoice cancels all of its accounting — admin only.
  @Patch('invoices/:id/void')
  @Roles(...ADMIN_ONLY)
  voidInvoice(
    @Param('id') id: string,
    @Body() dto: VoidInvoiceDto,
    @CurrentUser('id') currentUserId: string | undefined,
  ) {
    return this.invoices.voidInvoice(id, {
      reason: dto.reason,
      voidedBy: dto.voidedBy ?? currentUserId,
    });
  }

  @Get('invoices/:id/receipt')
  @Roles(...CAN_VIEW_BILLING)
  getReceipt(@Param('id') id: string) {
    return this.invoices.getReceipt(id);
  }

  // ── Ledger (additional sources) ──────────────────────────────────

  @Post('ledger/from-service')
  @Roles(...CAN_CREATE_LEDGER)
  createLedgerEntryFromService(
    @Body()
    dto: {
      patientId: string;
      visitId?: string;
      serviceId: string;
      quantity?: number;
      overridePrice?: number;
      overrideCurrency?: string;
      overrideRate?: number;
      notes?: string;
    },
  ) {
    return this.ledger.createFromBillingService(dto);
  }

  @Post('ledger/from-prescription-item')
  @Roles(...CAN_CREATE_PRESCRIPTION_LEDGER)
  async createLedgerFromPrescriptionItem(
    @Body() dto: { prescriptionItemId: string; currency?: string; exchangeRate?: number },
  ) {
    return this.ledger.createFromPrescriptionItem(
      dto.prescriptionItemId,
      dto.currency,
      dto.exchangeRate,
    );
  }

  // ── Invoice Lifecycle (new architecture) ────────────────────────

  // Draft invoices can be created by anyone with billing access — dentist may
  // open one during a visit, receptionist finalises it.
  @Post('invoices/draft')
  @Roles(...CAN_CREATE_INVOICE, UserRole.DENTIST)
  createDraftInvoice(
    @Body() dto: CreateDraftInvoiceDto,
    @CurrentUser('id') currentUserId: string | undefined,
  ) {
    return this.lifecycle.getOrCreateDraft(
      dto.patientId,
      dto.visitId,
      dto.treatmentPlanId,
      undefined,
      currentUserId,
    );
  }

  @Get('invoices/draft/summary')
  @Roles(...CAN_VIEW_BILLING)
  getDraftSummary(
    @Query('patientId') patientId: string,
    @Query('visitId') visitId?: string,
  ) {
    return this.lifecycle.getDraftSummary(patientId, visitId);
  }

  // Activating a DRAFT → POSTED is the moment it becomes billable — restrict.
  @Post('invoices/:id/activate')
  @Roles(...CAN_RECORD_PAYMENT)
  activateInvoice(@Param('id') id: string, @Body() dto: ActivateInvoiceDto) {
    return this.lifecycle.activateInvoice(id, dto.activatedBy);
  }

  // Encounter items can be added by clinical staff and billing staff.
  @Post('invoices/:id/encounter-items')
  @Roles(...CAN_EDIT_INVOICE, UserRole.DENTIST)
  addEncounterItem(@Param('id') id: string, @Body() dto: AddEncounterItemDto) {
    return this.lifecycle.addEncounterItem(id, dto);
  }

  @Patch('invoices/:id/meta')
  @Roles(...CAN_EDIT_INVOICE)
  updateInvoiceMeta(
    @Param('id') id: string,
    @Body() dto: { paymentTerms?: string; notes?: string },
  ) {
    return this.invoices.updateMeta(id, dto);
  }

  // P0: changing invoice currency mid-flight retroactively rewrites every
  // amount — admin only.
  @Patch('invoices/:id/currency')
  @Roles(...ADMIN_ONLY)
  changeInvoiceCurrency(
    @Param('id') id: string,
    @Body() dto: { currency: string },
  ) {
    return this.invoices.changeCurrency(id, dto);
  }
}
