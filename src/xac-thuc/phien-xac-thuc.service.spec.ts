import { AuthSessionService } from './phien-xac-thuc.service.js';

describe('AuthSessionService', () => {
  let service: AuthSessionService;

  beforeEach(() => {
    service = new AuthSessionService();
  });

  it('validates a signed session', () => {
    const token = service.create('admin', 'quan-tri-vien');

    expect(service.verify(token)).toMatchObject({
      username: 'admin',
      role: 'quan-tri-vien',
    });
  });

  it('validates an area manager session', () => {
    const token = service.create('manager01', 'quan-ly-khu-vuc');

    expect(service.verify(token)).toMatchObject({
      username: 'manager01',
      role: 'quan-ly-khu-vuc',
    });
  });

  it('rejects a modified session token', () => {
    const token = service.create('admin', 'quan-tri-vien');
    const modifiedToken = `${token.slice(0, -1)}x`;

    expect(service.verify(modifiedToken)).toBeNull();
  });
});
