// src/expense-categories/expense-categories.module.ts
import { Module } from '@nestjs/common';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ExpenseCategoriesController } from './expense-categories.controller';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';

@Module({
  imports: [GeneralLedgerModule],
  controllers: [ExpenseCategoriesController],
  providers: [ExpenseCategoriesService],
  exports: [ExpenseCategoriesService],
})
export class ExpenseCategoriesModule {}
