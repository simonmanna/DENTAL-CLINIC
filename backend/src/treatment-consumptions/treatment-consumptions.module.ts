import { Module } from '@nestjs/common';
import { TreatmentConsumptionsController } from './treatment-consumptions.controller';
import { TreatmentConsumptionsService } from './treatment-consumptions.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TreatmentConsumptionsController],
  providers: [TreatmentConsumptionsService],
  exports: [TreatmentConsumptionsService],
})
export class TreatmentConsumptionsModule {}