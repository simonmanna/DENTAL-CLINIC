import { Module } from '@nestjs/common';
import { GeneralLedgerService } from './general-ledger.service';
import { GeneralLedgerController } from './general-ledger.controller';
import { DocumentNumberModule } from '../common/document-number/document-number.module';

@Module({
  imports: [DocumentNumberModule],
  controllers: [GeneralLedgerController],
  providers: [GeneralLedgerService],
  exports: [GeneralLedgerService],
})
export class GeneralLedgerModule {}
