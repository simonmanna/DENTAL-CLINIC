// src/expenses/expenses.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { PaymentsModule } from '../payments/payments.module';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { DocumentNumberModule } from '../common/document-number/document-number.module';

@Module({
  imports: [
    forwardRef(() => PaymentsModule),
    GeneralLedgerModule,
    DocumentNumberModule,
  ],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}