import type { Request } from 'express';

import { NguoiDungService } from './nguoi-dung.service.js';

export async function getAllowedProjectIds(
  request: Request,
  users: NguoiDungService,
): Promise<number[] | undefined> {
  const session = request.authSession;
  if (!session || session.role !== 'ky-su') return undefined;

  const account = await users.findAccountByUsername(session.username);
  return users.findAssignedProjectIds(account.ma_nguoi_dung);
}
