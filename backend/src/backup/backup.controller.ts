import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { BackupService } from './backup.service';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin/backups')
export class BackupController {
  constructor(private readonly backups: BackupService) {}

  @Get('status')
  status() {
    return this.backups.getStatus();
  }

  @Post('full')
  @Roles('SUPER_ADMIN', 'ADMIN')
  runFull() {
    return this.backups.runFullBackup();
  }

  @Post('base')
  @Roles('SUPER_ADMIN', 'ADMIN')
  runBase() {
    return this.backups.runBaseBackup();
  }

  @Post('files')
  @Roles('SUPER_ADMIN', 'ADMIN')
  runFiles() {
    return this.backups.runFilesBackup();
  }
}
