import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { BackupService } from './backup.service';
import { createFolder, listFolders } from './backup-locations';
import {
  BackupNowDto,
  CheckLocationDto,
  CreateFolderDto,
  UpdateBackupSettingsDto,
} from './backup.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin/backups')
export class BackupController {
  constructor(private readonly backups: BackupService) {}

  @Get('status')
  status() {
    return this.backups.getStatus();
  }

  @Get('settings')
  @Roles('SUPER_ADMIN', 'ADMIN')
  settings() {
    return this.backups.getSettings();
  }

  @Put('settings')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async updateSettings(@Body() dto: UpdateBackupSettingsDto) {
    await this.backups.updateSettings(dto);
    return this.backups.getSettings();
  }

  /** Back up now — to the regular location, or to `location` just this once. */
  @Post('run')
  @HttpCode(202)
  @Roles('SUPER_ADMIN', 'ADMIN')
  run(@Body() dto: BackupNowDto) {
    return this.backups.startBackup(dto);
  }

  @Post('base')
  @HttpCode(202)
  @Roles('SUPER_ADMIN', 'ADMIN')
  runBase() {
    return this.backups.startBaseBackup();
  }

  @Post('check-location')
  @HttpCode(200)
  @Roles('SUPER_ADMIN', 'ADMIN')
  checkLocation(@Body() dto: CheckLocationDto) {
    return this.backups.checkLocation(dto.path);
  }

  /** Server-side folder browser (folders only) for picking a backup location. */
  @Get('browse')
  @Roles('SUPER_ADMIN', 'ADMIN')
  browse(@Query('path') path?: string) {
    return listFolders(path);
  }

  @Post('browse/folder')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async createFolder(@Body() dto: CreateFolderDto) {
    return { path: await createFolder(dto.parent, dto.name) };
  }
}
