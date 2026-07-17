import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set('trust proxy', true);
  // crossOriginResourcePolicy relaxed so the SPA on another origin can load
  // API-served assets (e.g. uploaded imaging) — everything else at defaults.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const ioAdapter = new IoAdapter(app);
  app.useWebSocketAdapter(ioAdapter);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new PrismaExceptionFilter());

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
}
bootstrap().catch((err) => {
  console.error('Failed to bootstrap application', err);
  process.exit(1);
});
