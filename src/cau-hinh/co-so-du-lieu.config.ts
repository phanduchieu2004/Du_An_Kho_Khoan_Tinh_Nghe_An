import 'dotenv/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

const password = process.env.DB_PASSWORD?.trim();

if (!password) {
  throw new Error('Thiếu DB_PASSWORD trong cấu hình môi trường.');
}

export const db: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password,
  database: process.env.DB_DATABASE || 'ho_khoan_na',
  autoLoadEntities: true,
  synchronize: false,
  logging: true,
};