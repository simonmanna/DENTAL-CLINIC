// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
// DentalChartModule (ToothRecord/ToothStatus system) removed — legacy/orphaned.
// The live dental chart is driven by ChartEntry (ChartEntryModule) + treatment
// procedures + conditions. See ChartEntry in schema.prisma for the source of truth.
import { TreatmentPlansModule } from './treatment-plans/treatment-plans.module';
import { BillingModule } from './billing/billing.module';
import { EmrModule } from './emr/emr.module';
import { ImagingModule } from './imaging/imaging.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { InventoryModule } from './inventory/inventory.module';
import { StaffModule } from './staff/staff.module';
import { ReportsModule } from './reports/reports.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { VisitModule } from './visit/visit.module';
import { LocationsModule } from './locations/locations.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ExpenseCategoriesModule } from './expense-categories/expense-categories.module';
import { ProceduresModule } from './procedures/procedures.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { DrugsModule } from './drugs/drugs.module';
import { PurchaseModule } from './purchase/purchase.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { AccountsModule } from './accounts/accounts.module';
import { FixedAssetsModule } from './fixed-assets/fixed-assets.module';
import { UsersModule } from './users/users.module';
import { BillingServicesModule } from './billing-services/billing-services.module';
import { StockLogModule } from './stock-log/stock-log.module';
import { InventoryCategoryModule } from './inventory-category/inventory-category.module';
import { WasteModule } from './waste/waste.module';
import { StockAdjustmentModule } from './stock-adjustment/stock-adjustment.module';
import { PaymentsModule } from './payments/payments.module';
import { DrugCategoryModule } from './drug-category/drug-category.module';
import { StockTransferModule } from './stock-transfer/stock-transfer.module';
import { ChartEntryModule } from './chart-entry/chart-entry.module';
import { StorageModule } from './storage/storage.module';
import { AuditLogModule } from './audit-log/audit-log.module';

import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
// import { ClinicalReportModule } from './clinical-report/clinical-report.module';
import { ClinicalReportsModule } from './clinical-report/clinical-report.module';
import { ConditionsModule } from './conditions/conditions.module';
import { TreatmentPlansEditModule } from './treatment-plans/treatment-plans-edit.module';
import { StockOutModule } from './stock-out/stock-out.module';
import { DirectStockModule } from './direct-stock/direct-stock.module';
import { FinancialReportingModule } from './financial-reporting/financial-reporting.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ClinicSettingsModule } from './clinic-settings/clinic-settings.module';
import { SequenceModule } from './common/sequence/sequence.module';
import { DocumentNumberModule } from './common/document-number/document-number.module';
import { GeneralLedgerModule } from './general-ledger/general-ledger.module';
import { SupplierPaymentsModule } from './supplier-payments/supplier-payments.module';
import { TreatmentConsumptionsModule } from './treatment-consumptions/treatment-consumptions.module';

import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthModule } from './health/health.module';
import { BackupModule } from './backup/backup.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'), // Path to your uploads folder
      serveRoot: '/uploads', // The URL prefix
      serveStaticOptions: {
        setHeaders: (res: import('express').Response) => {
          res.set(
            'Access-Control-Allow-Origin',
            process.env.CORS_ORIGIN || 'http://localhost:5173',
          );
        },
      },
    }),
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
    HealthModule,
    PrismaModule,
    SequenceModule,
    DocumentNumberModule,
    AuthModule,
    PatientsModule,
    AppointmentsModule,
    TreatmentPlansModule,
    BillingModule,
    EmrModule,
    ImagingModule,
    PharmacyModule,
    InventoryModule,
    StaffModule,
    ReportsModule,
    VisitModule,
    LocationsModule,
    ExpensesModule,
    ExpenseCategoriesModule,
    ProceduresModule,
    PrescriptionsModule,
    DrugsModule,
    PurchaseModule,
    SuppliersModule,
    ReceiptsModule,
    AccountsModule,
    FixedAssetsModule,
    UsersModule,
    BillingServicesModule,
    StockLogModule,
    InventoryCategoryModule,
    WasteModule,
    StockAdjustmentModule,
    PaymentsModule,
    DrugCategoryModule,
    StockTransferModule,
    ChartEntryModule,
    StorageModule,
    AuditLogModule,
    ClinicalReportsModule,
    ConditionsModule,
    TreatmentPlansEditModule,
    StockOutModule,
    DirectStockModule,
    FinancialReportingModule,
    NotificationsModule,
    ClinicSettingsModule,
    GeneralLedgerModule,
    SupplierPaymentsModule,
    TreatmentConsumptionsModule,
    BackupModule,
    EventEmitterModule.forRoot({
      // Global: events are emitted and listened across all modules
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
  ],
  providers: [
    // Order matters: ThrottlerGuard first so brute-force attempts are rejected
    // before JWT validation does any DB work.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // RolesGuard reads @Roles(...) metadata; routes without the decorator
    // are still allowed (JwtAuthGuard above already enforces authentication).
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
