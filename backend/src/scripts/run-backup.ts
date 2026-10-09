import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BackupService } from '../backup/backup.service';

// Usage: node dist/src/scripts/run-backup.js [full|base] [--to <folder>] [--no-uploads]
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const kind = args[0] && !args[0].startsWith('--') ? args[0] : 'full';
  const toIdx = args.indexOf('--to');
  const location = toIdx >= 0 ? args[toIdx + 1] : undefined;
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const backups = app.get(BackupService);
    const results =
      kind === 'base'
        ? [await backups.runBaseBackup('manual')]
        : await backups.runBackup({
            trigger: 'manual',
            location,
            includeUploads: args.includes('--no-uploads') ? false : undefined,
          });
    console.log(JSON.stringify(results, null, 2));
    process.exitCode = results.some((r) => r.status === 'failed') ? 1 : 0;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
