import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Render,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LOGIN_ROLES } from '../../xac-thuc/vai-tro-dang-nhap.js';
import { HoTroService } from './ho-tro.service.js';

@Controller('ho-tro')
export class HoTroController {
  constructor(private readonly support: HoTroService) {}

  @Get()
  @Render('ho_tro')
  async index(
    @Req() request: Request,
    @Query('conversation') selectedConversation?: string,
  ) {
    const session = request.authSession;
    if (!session) {
      throw new BadRequestException('Vui lòng đăng nhập để xem hỗ trợ.');
    }
    if (session.role === 'ky-su') {
      const selectedId =
        selectedConversation === undefined
          ? undefined
          : this.parseConversationId(selectedConversation);
      const inbox = await this.support.listEngineerConversations(
        session.username,
        selectedId,
      );
      return {
        title: 'Hỗ trợ kỹ sư',
        role: session.role,
        conversations: inbox.conversations,
        selectedConversation: inbox.selectedConversation,
        account: inbox.account,
        viewerId: inbox.viewerId,
        currentUser: session,
      };
    }
    if (
      session.role === 'quan-tri-vien' ||
      session.role === 'quan-ly-khu-vuc'
    ) {
      const selectedId =
        selectedConversation === undefined
          ? undefined
          : this.parseConversationId(selectedConversation);
      const inbox = await this.support.listAdminConversations(
        session.username,
        selectedId,
      );
      return {
        title:
          session.role === 'quan-tri-vien'
            ? 'Hộp thư hỗ trợ'
            : 'Hỗ trợ tài khoản',
        role: session.role,
        conversations: inbox.conversations,
        selectedConversation: inbox.selectedConversation,
        portalOptions: LOGIN_ROLES,
        viewerId: inbox.viewerId,
        currentUser: session,
      };
    }
    throw new BadRequestException(
      'Chức năng hỗ trợ chỉ dành cho Kỹ sư, Quản lý khu vực và Quản trị viên.',
    );
  }

  @Get('tim-ky-su')
  async findEngineer(
    @Query('email') email: string | undefined,
    @Req() request: Request,
  ) {
    if (request.authSession?.role !== 'ky-su') {
      throw new ForbiddenException('Chỉ Kỹ sư mới có thể tìm tài khoản Kỹ sư.');
    }
    if (typeof email !== 'string') {
      throw new BadRequestException('Gmail không hợp lệ.');
    }
    return this.support.findEngineerByEmail(request.authSession.username, email);
  }

  @Post('chat-ky-su')
  async startEngineerChat(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const session = request.authSession;
    if (session?.role !== 'ky-su') {
      throw new ForbiddenException('Chỉ Kỹ sư mới có thể nhắn tin Kỹ sư khác.');
    }
    if (typeof body.recipient_id !== 'string') {
      throw new BadRequestException('Mã tài khoản nhận tin không hợp lệ.');
    }
    const recipientId = this.parseConversationId(body.recipient_id);
    const conversationId = await this.support.createEngineerDirectConversation(
      session.username,
      recipientId,
      this.readText(body.noi_dung, 'Nội dung tin nhắn'),
    );
    response.redirect(
      `/ho-tro?conversation=${conversationId}#yeu-cau-${conversationId}`,
    );
  }

  @Post('gui')
  async create(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const session = request.authSession;
    if (session?.role !== 'ky-su') {
      throw new BadRequestException(
        'Chỉ Kỹ sư mới có thể gửi yêu cầu hỗ trợ mới.',
      );
    }
    const title = this.readText(body.tieu_de, 'Tiêu đề');
    const message = this.readText(body.noi_dung, 'Nội dung tin nhắn');
    const requestId = await this.support.createEngineerConversation(
      session.username,
      title,
      message,
    );
    response.redirect(`/ho-tro?conversation=${requestId}#yeu-cau-${requestId}`);
  }

  @Post(':id/tra-loi')
  async reply(
    @Param('id', ParseIntPipe) requestId: number,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const session = request.authSession;
    if (
      !session ||
      (session.role !== 'ky-su' &&
        session.role !== 'quan-tri-vien' &&
        session.role !== 'quan-ly-khu-vuc')
    ) {
      throw new ForbiddenException(
        'Chức năng trả lời chỉ dành cho Kỹ sư và Quản trị viên.',
      );
    }
    await this.support.replyToConversation(
      requestId,
      session.username,
      session.role,
      this.readText(body.noi_dung, 'Nội dung tin nhắn'),
    );
    response.redirect(`/ho-tro?conversation=${requestId}#yeu-cau-${requestId}`);
  }

  private readText(value: unknown, label: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${label} không hợp lệ.`);
    }
    return value;
  }

  private parseConversationId(value: string): number {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new BadRequestException('Mã hội thoại không hợp lệ.');
    }
    const id = Number(value);
    if (!Number.isSafeInteger(id)) {
      throw new BadRequestException('Mã hội thoại không hợp lệ.');
    }
    return id;
  }
}
