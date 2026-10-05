import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { FileTokenService } from './file-token.service';
import { FilesController } from './files.controller';

@Module({
  imports: [StorageModule],
  controllers: [FilesController],
  providers: [FileTokenService],
  exports: [FileTokenService],
})
export class FilesModule {}
