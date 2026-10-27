
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './ung-dung.module.js';
import express from 'express';
import { join } from 'node:path';
import { getProjectRoot } from './tien-ich/duong-dan-ung-dung.js';

async function bootstrap() {
  const configuredPort = process.env.PORT?.trim();
  const requestedPort = configuredPort ? Number(configuredPort) : 3000;

  if (
    !Number.isInteger(requestedPort) ||
    requestedPort < 1 ||
    requestedPort > 65535
  ) {
    throw new Error('PORT phải là số nguyên từ 1 đến 65535.');
  }

  const server = express();
  const projectRoot = getProjectRoot(import.meta.url);

  server.use(express.json({ limit: '8mb' }));
  server.use(express.urlencoded({ extended: false, limit: '16mb' }));
  server.set('views', join(projectRoot, 'src', 'views'));
  server.set('view engine', 'ejs');

  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(server),
    { bodyParser: false },
  );

  await app.listen(requestedPort);
  console.info(`Ứng dụng đang chạy tại http://localhost:${requestedPort}`);
}

void bootstrap().catch((error: unknown) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EADDRINUSE'
  ) {
    console.error(
      `Cổng ${process.env.PORT?.trim() || 3000} đang được sử dụng. ` +
        'Hãy dừng bản ứng dụng đang chạy rồi khởi động lại.',
    );
  }

  console.error('Ứng dụng không thể khởi động:', error);
  process.exitCode = 1;
});
