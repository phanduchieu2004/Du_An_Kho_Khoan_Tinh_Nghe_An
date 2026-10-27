import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/ung-dung.module.js';
import { getProjectRoot } from '../src/tien-ich/duong-dan-ung-dung.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const server = express();
    const projectRoot = getProjectRoot(
      new URL('../src/main.ts', import.meta.url).href,
    );
    server.set('views', join(projectRoot, 'src', 'views'));
    server.set('view engine', 'ejs');
    app = moduleFixture.createNestApplication(new ExpressAdapter(server));
    await app.init();
  });

  it('/ (GET) renders the map page', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Content-Type', /html/)
      .expect(/class="app"/);
  });

  afterEach(async () => {
    await app.close();
  });
});
