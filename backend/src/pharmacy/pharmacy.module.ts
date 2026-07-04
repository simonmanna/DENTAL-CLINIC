import { Module } from '@nestjs/common';
import { PharmacyController } from './pharmacy.controller';
import { PharmacyService } from './pharmacy.service';
import { PharmacySalesController } from './pharmacy-sales.controller';
import { PharmacySalesService } from './pharmacy-sales.service';
import { DrugCategoriesController } from './drug-categories/drug-categories.controller';
import { DrugCategoriesService } from './drug-categories/drug-categories.service';

import { DrugsService } from '../drugs/drugs.service';
import { DrugsController } from '../drugs/drugs.controller';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    BillingModule,   // ← ensures InvoicesService + LedgerService are available
  ],
  controllers: [
    DrugsController,
    PharmacyController,
    PharmacySalesController,
    DrugCategoriesController,
  ],
  providers: [
    PharmacyService,
    PharmacySalesService,
    DrugCategoriesService,
    DrugsService,
  ],
  exports: [PharmacyService],
})
export class PharmacyModule {}
