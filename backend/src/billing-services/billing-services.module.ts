import { Module } from '@nestjs/common';
import { BillingServicesController } from './billing-services.controller';
import { BillingServicesService } from './billing-services.service';

@Module({
  controllers: [BillingServicesController],
  providers: [BillingServicesService]
})
export class BillingServicesModule {}
