import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './ung-dung.service.js';

describe('AppService', () => {
  let appService: AppService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    appService = app.get<AppService>(AppService);
  });

  it('returns the service greeting', () => {
    expect(appService.getHello()).toBe('Hello World!');
  });
});
