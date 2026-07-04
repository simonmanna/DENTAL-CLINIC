import { Module, forwardRef } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { ExpensesModule } from '../expenses/expenses.module';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';

@Module({
  imports: [forwardRef(() => ExpensesModule), GeneralLedgerModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}