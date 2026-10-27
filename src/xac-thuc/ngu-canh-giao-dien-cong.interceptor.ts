import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { from, type Observable } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import type { AuthSession } from './phien-xac-thuc.service.js';
import { NguoiDungService } from '../phan-he/nguoi-dung/nguoi-dung.service.js';
import { UyQuyenService } from '../phan-he/uy-quyen/uy-quyen.service.js';

type AuthenticatedRequest = Request & { authSession?: AuthSession };
const RENDER_TEMPLATE_METADATA = '__renderTemplate__';

@Injectable()
export class PortalViewContextInterceptor implements NestInterceptor {
  constructor(
    private readonly users: NguoiDungService,
    private readonly reflector: Reflector,
    private readonly permissions: UyQuyenService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const renderTemplate = this.reflector.get<string | undefined>(
      RENDER_TEMPLATE_METADATA,
      context.getHandler(),
    );
    if (!request.authSession || !renderTemplate) {
      return next.handle();
    }

    return next.handle().pipe(
      concatMap((result: unknown) => from(this.addAccountViewContext(request, result))),
    );
  }

  private async addAccountViewContext(
    request: AuthenticatedRequest,
    result: unknown,
  ): Promise<unknown> {
    if (
      typeof result !== 'object' ||
      result === null ||
      Array.isArray(result) ||
      Object.getPrototypeOf(result) !== Object.prototype
    ) {
      return result;
    }

    const viewData = result as Record<string, unknown>;
    const existingUser = viewData.currentUser;
    const account = await this.users.findProfileByUsername(
      request.authSession!.username,
    );
    if (!account) {
      return result;
    }

    const hasAvatar = Boolean(
      await this.users.findAvatarPath(account.ma_nguoi_dung),
    );
    const pageId = this.permissions.getPageIdForPath(request.path);
    const pageButtons = await this.permissions.getButtonsForAccountOnPage(
      account.ma_nguoi_dung,
      pageId,
    );
    return {
      ...viewData,
      pageButtons,
      currentUser: {
        ...request.authSession,
        ...(typeof existingUser === 'object' && existingUser !== null
          ? existingUser
          : {}),
        fullName: account.ho_ten || account.ten_dang_nhap,
        assignedArea: account.khu_vuc_duoc_xem ?? '',
        hasAvatar,
        avatarUrl: hasAvatar ? '/nguoi-dung/ho-so/anh' : null,
      },
    };
  }
}
