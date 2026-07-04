// src/billing/billing.module.ts

import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { LedgerService } from './ledger.service';
import { InvoicesService } from './invoices.service';
import { InvoiceLifecycleService } from './invoice-lifecycle.service';
import { CurrencyService } from './currency.service';

import { PaymentAccountResolverService } from './payment-account-resolver.service';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';

@Module({
  imports: [GeneralLedgerModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    LedgerService,
    InvoicesService,
    InvoiceLifecycleService,
    CurrencyService,
    PaymentAccountResolverService,
  ],
  exports: [LedgerService, InvoicesService, InvoiceLifecycleService, CurrencyService, PaymentAccountResolverService],
})
export class BillingModule {}
