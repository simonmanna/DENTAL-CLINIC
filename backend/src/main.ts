import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Trust the reverse proxy so req.ip (used for audit client context) reflects
  // the real client address behind nginx / a load balancer, not the proxy hop.
  app.set('trust proxy', true);

  // ✅ IMPORTANT: Configure IoAdapter with CORS before calling useWebSocketAdapter
  const ioAdapter = new IoAdapter(app);
  app.useWebSocketAdapter(ioAdapter);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Kept false deliberately: extra unknown props are STRIPPED (safe) rather
      // than rejected, so a future frontend field never hard-fails an otherwise
      // valid clinical write. Validation still enforces declared field types.
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Map Prisma DB errors (e.g. the live-diagnosis unique index) to clean HTTP
  // responses instead of a 500 + stack leak.
  app.useGlobalFilters(new PrismaExceptionFilter());

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    },
  });

  app.enableCors({
    origin: 'http://localhost:5173',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(3001);
  console.log(`🚀 Backend running on http://localhost:3001`);
}
bootstrap();