// src/purchase/purchase.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { PurchaseController } from './purchase.controller';
import { PurchaseService } from './purchase.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { DocumentNumberModule } from '../common/document-number/document-number.module';

@Module({
  imports: [PrismaModule, forwardRef(() => PaymentsModule), DocumentNumberModule],
  controllers: [PurchaseController],
  providers: [PurchaseService],
  exports: [PurchaseService],
})
export class PurchaseModule {}
