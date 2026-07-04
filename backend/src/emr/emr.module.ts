import { Module } from '@nestjs/common';
import { EmrController } from './emr.controller';
import { EmrService } from './emr.service';
@Module({ controllers: [EmrController], providers: [EmrService], exports: [EmrService] })
export class EmrModule {}
