import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { NguoiDung } from '../nguoi-dung/thuc-the/nguoi-dung.entity.js';

const MESSAGE_MAX_LENGTH = 5000;

@Injectable()
export class HoTroService implements OnModuleInit {
  constructor(
    @InjectRepository(NguoiDung)
    private readonly repository: Repository<NguoiDung>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.query(`
      CREATE TABLE IF NOT EXISTS ho_tro_yeu_cau (
        id BIGSERIAL PRIMARY KEY,
        engineer_id INTEGER NOT NULL
          REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
        tieu_de VARCHAR(200) NOT NULL,
        loai_hoi_thoai VARCHAR(20) NOT NULL DEFAULT 'admin'
          CHECK (loai_hoi_thoai IN ('admin', 'ky-su')),
        recipient_id INTEGER
          REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
        trang_thai VARCHAR(20) NOT NULL DEFAULT 'cho_phan_hoi'
          CHECK (trang_thai IN ('cho_phan_hoi', 'da_tra_loi')),
        ngay_tao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ngay_cap_nhat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.repository.query(`
      ALTER TABLE ho_tro_yeu_cau
        ADD COLUMN IF NOT EXISTS loai_hoi_thoai VARCHAR(20) NOT NULL DEFAULT 'admin',
        ADD COLUMN IF NOT EXISTS recipient_id INTEGER
          REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE
    `);
    await this.repository.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ho_tro_tin_nhan_direct_pair
      ON ho_tro_yeu_cau (
        LEAST(engineer_id, recipient_id),
        GREATEST(engineer_id, recipient_id)
      )
      WHERE loai_hoi_thoai = 'ky-su'
    `);
    await this.repository.query(`
      CREATE TABLE IF NOT EXISTS ho_tro_tin_nhan (
        id BIGSERIAL PRIMARY KEY,
        yeu_cau_id BIGINT NOT NULL
          REFERENCES ho_tro_yeu_cau(id) ON DELETE CASCADE,
        sender_id INTEGER
          REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE SET NULL,
        sender_role VARCHAR(20) NOT NULL
          CHECK (sender_role IN ('ky-su', 'quan-tri-vien', 'quan-ly-khu-vuc')),
        sender_name VARCHAR(255) NOT NULL,
        sender_email VARCHAR(255),
        noi_dung TEXT NOT NULL CHECK (length(btrim(noi_dung)) BETWEEN 1 AND 5000),
        ngay_tao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.repository.query(`
      ALTER TABLE ho_tro_tin_nhan
      DROP CONSTRAINT IF EXISTS ho_tro_tin_nhan_sender_role_check
    `);
    await this.repository.query(`
      ALTER TABLE ho_tro_tin_nhan
      ADD CONSTRAINT ho_tro_tin_nhan_sender_role_check
      CHECK (sender_role IN ('ky-su', 'quan-tri-vien', 'quan-ly-khu-vuc'))
    `);
    await this.repository.query(`
      CREATE INDEX IF NOT EXISTS ho_tro_yeu_cau_engineer_updated
      ON ho_tro_yeu_cau (engineer_id, ngay_cap_nhat DESC)
    `);
    await this.repository.query(`
      CREATE INDEX IF NOT EXISTS ho_tro_tin_nhan_thread
      ON ho_tro_tin_nhan (yeu_cau_id, id)
    `);
    await this.repository.query(`
      CREATE TABLE IF NOT EXISTS ho_tro_admin_da_doc (
        admin_id INTEGER NOT NULL
          REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
        yeu_cau_id BIGINT NOT NULL
          REFERENCES ho_tro_yeu_cau(id) ON DELETE CASCADE,
        last_read_message_id BIGINT NOT NULL DEFAULT 0,
        ngay_doc TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (admin_id, yeu_cau_id)
      )
    `);
    await this.repository.query(`
      CREATE TABLE IF NOT EXISTS ho_tro_tai_khoan_da_doc (
        account_id INTEGER NOT NULL
          REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
        yeu_cau_id BIGINT NOT NULL
          REFERENCES ho_tro_yeu_cau(id) ON DELETE CASCADE,
        last_read_message_id BIGINT NOT NULL DEFAULT 0,
        ngay_doc TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (account_id, yeu_cau_id)
      )
    `);
  }

  async listEngineerConversations(
    username: string,
    selectedConversationId?: number,
  ) {
    const account = await this.findSenderAccount(username, false);
    if (selectedConversationId !== undefined) {
      const access = (await this.repository.manager.query(
        `SELECT id
         FROM ho_tro_yeu_cau
         WHERE id = $1
           AND (
             (loai_hoi_thoai = 'admin' AND engineer_id = $2)
             OR (loai_hoi_thoai = 'ky-su' AND $2 IN (engineer_id, recipient_id))
           )`,
        [selectedConversationId, account.ma_nguoi_dung],
      )) as Array<{ id: number }>;
      if (!access[0]) {
        throw new NotFoundException('Không tìm thấy hội thoại hỗ trợ.');
      }
      await this.repository.manager.query(
        `INSERT INTO ho_tro_tai_khoan_da_doc (
           account_id, yeu_cau_id, last_read_message_id, ngay_doc
         )
         VALUES (
           $1, $2,
           COALESCE(
             (SELECT MAX(id) FROM ho_tro_tin_nhan WHERE yeu_cau_id = $2),
             0
           ),
           CURRENT_TIMESTAMP
         )
         ON CONFLICT (account_id, yeu_cau_id)
         DO UPDATE SET
           last_read_message_id = EXCLUDED.last_read_message_id,
           ngay_doc = CURRENT_TIMESTAMP`,
        [account.ma_nguoi_dung, selectedConversationId],
      );
    }

    const conversations = (await this.repository.manager.query(
      `SELECT c.id, c.tieu_de, c.trang_thai, c.loai_hoi_thoai,
              CASE WHEN c.loai_hoi_thoai = 'admin'
                THEN 'Hỗ trợ quản trị viên'
                ELSE COALESCE(peer.ho_ten, peer.ten_dang_nhap)
              END AS peer_name,
              CASE WHEN c.loai_hoi_thoai = 'ky-su'
                THEN peer.email ELSE NULL END AS peer_email,
              latest.noi_dung AS latest_message,
              latest.sender_id AS latest_sender_id,
              latest.sender_role AS latest_sender_role,
              latest.ngay_tao AS latest_message_at,
              EXISTS (
                SELECT 1 FROM ho_tro_tin_nhan incoming
                LEFT JOIN ho_tro_tai_khoan_da_doc read_state
                  ON read_state.account_id = $1 AND read_state.yeu_cau_id = c.id
                WHERE incoming.yeu_cau_id = c.id
                  AND incoming.sender_id <> $1
                  AND incoming.id > COALESCE(read_state.last_read_message_id, 0)
              ) AS unread
       FROM ho_tro_yeu_cau c
       LEFT JOIN nguoi_dung peer ON peer.ma_nguoi_dung = CASE
         WHEN c.loai_hoi_thoai = 'ky-su' AND c.engineer_id = $1 THEN c.recipient_id
         WHEN c.loai_hoi_thoai = 'ky-su' THEN c.engineer_id
         ELSE NULL
       END
       LEFT JOIN LATERAL (
         SELECT m.id, m.sender_id, m.sender_role, m.noi_dung, m.ngay_tao
         FROM ho_tro_tin_nhan m
         WHERE m.yeu_cau_id = c.id
         ORDER BY m.id DESC
         LIMIT 1
       ) latest ON TRUE
       WHERE (
         (c.loai_hoi_thoai = 'admin' AND c.engineer_id = $1)
         OR (c.loai_hoi_thoai = 'ky-su' AND $1 IN (c.engineer_id, c.recipient_id))
       )
       AND latest.id IS NOT NULL
       ORDER BY latest.ngay_tao DESC, latest.id DESC`,
      [account.ma_nguoi_dung],
    )) as Array<Record<string, unknown>>;

    let selectedConversation: Record<string, unknown> | null = null;
    if (selectedConversationId !== undefined) {
      const selectedRows = (await this.repository.manager.query(
        `SELECT c.id, c.tieu_de, c.trang_thai, c.loai_hoi_thoai,
                CASE WHEN c.loai_hoi_thoai = 'admin'
                  THEN 'Hỗ trợ quản trị viên'
                  ELSE COALESCE(peer.ho_ten, peer.ten_dang_nhap)
                END AS peer_name,
                peer.ma_nguoi_dung AS peer_id,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', m.id,
                      'sender_id', m.sender_id,
                      'sender_role', m.sender_role,
                      'sender_name', m.sender_name,
                      'sender_email', m.sender_email,
                      'noi_dung', m.noi_dung,
                      'ngay_tao', m.ngay_tao
                    ) ORDER BY m.id
                  ) FILTER (WHERE m.id IS NOT NULL),
                  '[]'::json
                ) AS messages
         FROM ho_tro_yeu_cau c
         LEFT JOIN nguoi_dung peer ON peer.ma_nguoi_dung = CASE
           WHEN c.loai_hoi_thoai = 'ky-su' AND c.engineer_id = $2 THEN c.recipient_id
           WHEN c.loai_hoi_thoai = 'ky-su' THEN c.engineer_id
           ELSE NULL
         END
         LEFT JOIN ho_tro_tin_nhan m ON m.yeu_cau_id = c.id
         WHERE c.id = $1 AND (
           (c.loai_hoi_thoai = 'admin' AND c.engineer_id = $2)
           OR (c.loai_hoi_thoai = 'ky-su' AND $2 IN (c.engineer_id, c.recipient_id))
         )
         GROUP BY c.id, peer.ma_nguoi_dung`,
        [selectedConversationId, account.ma_nguoi_dung],
      )) as Array<Record<string, unknown>>;
      selectedConversation = selectedRows[0] ?? null;
    }
    return {
      account,
      conversations,
      selectedConversation,
      viewerId: account.ma_nguoi_dung,
    };
  }

  async listAdminConversations(username: string, selectedConversationId?: number) {
    const admin = await this.findSenderAccount(username, false);
    if (selectedConversationId !== undefined) {
      const conversations = (await this.repository.manager.query(
        `SELECT id
         FROM ho_tro_yeu_cau
         WHERE id = $1 AND loai_hoi_thoai = 'admin'`,
        [selectedConversationId],
      )) as Array<{ id: number }>;
      if (!conversations[0]) {
        throw new NotFoundException('Không tìm thấy hội thoại hỗ trợ.');
      }
      await this.repository.manager.query(
        `INSERT INTO ho_tro_admin_da_doc (
           admin_id, yeu_cau_id, last_read_message_id, ngay_doc
         )
         VALUES (
           $1, $2,
           COALESCE(
             (SELECT MAX(id) FROM ho_tro_tin_nhan WHERE yeu_cau_id = $2),
             0
           ),
           CURRENT_TIMESTAMP
         )
         ON CONFLICT (admin_id, yeu_cau_id)
         DO UPDATE SET
           last_read_message_id = EXCLUDED.last_read_message_id,
           ngay_doc = CURRENT_TIMESTAMP`,
        [admin.ma_nguoi_dung, selectedConversationId],
      );
    }

    const conversations = (await this.repository.manager.query(
      `SELECT c.id, c.engineer_id, c.tieu_de, c.trang_thai,
              u.ten_dang_nhap AS engineer_username,
              u.ho_ten AS engineer_name,
              u.email AS engineer_email,
              u.cong_vai_tro AS engineer_roles,
              latest.noi_dung AS latest_message,
              latest.sender_id AS latest_sender_id,
              latest.sender_role AS latest_sender_role,
              latest.ngay_tao AS latest_message_at,
              COALESCE(latest.ngay_tao, c.ngay_tao) AS sort_time,
              EXISTS (
                SELECT 1
                FROM ho_tro_tin_nhan incoming
                LEFT JOIN ho_tro_admin_da_doc read_state
                  ON read_state.admin_id = $1
                 AND read_state.yeu_cau_id = c.id
                WHERE incoming.yeu_cau_id = c.id
                  AND incoming.sender_role = 'ky-su'
                  AND incoming.id > COALESCE(read_state.last_read_message_id, 0)
              ) AS unread
       FROM ho_tro_yeu_cau c
       JOIN nguoi_dung u ON u.ma_nguoi_dung = c.engineer_id
       LEFT JOIN LATERAL (
         SELECT m.noi_dung, m.sender_id, m.sender_role, m.ngay_tao
         FROM ho_tro_tin_nhan m
         WHERE m.yeu_cau_id = c.id
         ORDER BY m.ngay_tao DESC, m.id DESC
         LIMIT 1
       ) latest ON TRUE
       WHERE c.loai_hoi_thoai = 'admin' AND EXISTS (
         SELECT 1 FROM ho_tro_tin_nhan any_message
         WHERE any_message.yeu_cau_id = c.id
       )
       ORDER BY sort_time DESC, c.id DESC`,
      [admin.ma_nguoi_dung],
    )) as Array<Record<string, unknown>>;

    let selectedConversation: Record<string, unknown> | null = null;
    if (selectedConversationId !== undefined) {
      const selectedRows = (await this.repository.manager.query(
        `SELECT c.id, c.engineer_id, c.tieu_de, c.trang_thai,
                u.ten_dang_nhap AS engineer_username,
                u.ho_ten AS engineer_name,
                u.email AS engineer_email,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', m.id,
                      'sender_id', m.sender_id,
                      'sender_role', m.sender_role,
                      'sender_name', m.sender_name,
                      'sender_email', m.sender_email,
                      'noi_dung', m.noi_dung,
                      'ngay_tao', m.ngay_tao
                    ) ORDER BY m.id
                  ) FILTER (WHERE m.id IS NOT NULL),
                  '[]'::json
                ) AS messages
         FROM ho_tro_yeu_cau c
         JOIN nguoi_dung u ON u.ma_nguoi_dung = c.engineer_id
         LEFT JOIN ho_tro_tin_nhan m ON m.yeu_cau_id = c.id
         WHERE c.id = $1 AND c.loai_hoi_thoai = 'admin'
         GROUP BY c.id, u.ma_nguoi_dung`,
        [selectedConversationId],
      )) as Array<Record<string, unknown>>;
      selectedConversation = selectedRows[0] ?? null;
    }

    return {
      conversations,
      selectedConversation,
      viewerId: admin.ma_nguoi_dung,
    };
  }

  async findEngineerByEmail(username: string, email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail.length > 255) {
      throw new BadRequestException('Gmail không hợp lệ.');
    }
    const account = await this.findSenderAccount(username, false);
    const matches = (await this.repository.manager.query(
      `SELECT ma_nguoi_dung, ho_ten, ten_dang_nhap, email
       FROM nguoi_dung
       WHERE LOWER(email) = $1
         AND ma_nguoi_dung <> $2
         AND 'ky-su' = ANY(cong_vai_tro)
       LIMIT 1`,
      [normalizedEmail, account.ma_nguoi_dung],
    )) as Array<{
      ma_nguoi_dung: number;
      ho_ten: string | null;
      ten_dang_nhap: string;
      email: string;
    }>;
    const match = matches[0];
    if (!match) {
      throw new NotFoundException(
        'Không tìm thấy tài khoản Kỹ sư đã đăng ký bằng Gmail này.',
      );
    }
    return {
      id: match.ma_nguoi_dung,
      name: match.ho_ten || match.ten_dang_nhap,
      email: match.email,
    };
  }

  async createEngineerDirectConversation(
    username: string,
    recipientId: number,
    message: string,
  ): Promise<number> {
    const normalizedMessage = this.validateText(
      message,
      MESSAGE_MAX_LENGTH,
      'Nội dung tin nhắn',
    );
    const sender = await this.findSenderAccount(username, false);
    if (sender.ma_nguoi_dung === recipientId) {
      throw new BadRequestException('Không thể tự nhắn tin cho chính mình.');
    }
    return this.repository.manager.transaction(async (manager) => {
      const recipients = (await manager.query(
        `SELECT ma_nguoi_dung, ten_dang_nhap, email, cong_vai_tro
         FROM nguoi_dung
         WHERE ma_nguoi_dung = $1`,
        [recipientId],
      )) as Array<{
        ma_nguoi_dung: number;
        ten_dang_nhap: string;
        email: string | null;
        cong_vai_tro: string[];
      }>;
      const recipient = recipients[0];
      if (!recipient?.email || !recipient.cong_vai_tro?.includes('ky-su')) {
        throw new NotFoundException(
          'Không tìm thấy tài khoản Kỹ sư nhận tin nhắn.',
        );
      }
      await manager.query(
        'SELECT pg_advisory_xact_lock(LEAST($1, $2), GREATEST($1, $2))',
        [sender.ma_nguoi_dung, recipientId],
      );
      const existing = (await manager.query(
        `SELECT id FROM ho_tro_yeu_cau
         WHERE loai_hoi_thoai = 'ky-su'
           AND LEAST(engineer_id, recipient_id) = LEAST($1, $2)
           AND GREATEST(engineer_id, recipient_id) = GREATEST($1, $2)
         ORDER BY id
         LIMIT 1`,
        [sender.ma_nguoi_dung, recipientId],
      )) as Array<{ id: number }>;
      const conversationId =
        existing[0]?.id ??
        (
          (await manager.query(
            `INSERT INTO ho_tro_yeu_cau (
               engineer_id, recipient_id, loai_hoi_thoai, tieu_de
             )
             VALUES ($1, $2, 'ky-su', $3)
             RETURNING id`,
            [
              sender.ma_nguoi_dung,
              recipientId,
              `Trò chuyện với ${recipient.ten_dang_nhap}`,
            ],
          )) as Array<{ id: number }>
        )[0]?.id;
      if (!conversationId) {
        throw new Error('Không tạo được hội thoại giữa các Kỹ sư.');
      }
      await manager.query(
        `INSERT INTO ho_tro_tin_nhan (
           yeu_cau_id, sender_id, sender_role, sender_name, sender_email,
           noi_dung
         ) VALUES ($1, $2, 'ky-su', $3, $4, $5)`,
        [
          conversationId,
          sender.ma_nguoi_dung,
          sender.ho_ten || sender.ten_dang_nhap,
          sender.email,
          normalizedMessage,
        ],
      );
      return Number(conversationId);
    });
  }

  async createEngineerConversation(
    username: string,
    title: string,
    message: string,
  ): Promise<number> {
    const normalizedTitle = this.validateText(title, 200, 'Tiêu đề');
    const normalizedMessage = this.validateText(
      message,
      MESSAGE_MAX_LENGTH,
      'Nội dung tin nhắn',
    );
    const account = await this.findSenderAccount(username, true);
    if (!account.email) {
      throw new BadRequestException(
        'Tài khoản kỹ sư chưa có Gmail. Vui lòng cập nhật Gmail trong hồ sơ trước khi gửi yêu cầu hỗ trợ.',
      );
    }

    return this.repository.manager.transaction(async (manager) => {
      const created = (await manager.query(
        `INSERT INTO ho_tro_yeu_cau (engineer_id, tieu_de)
         VALUES ($1, $2)
         RETURNING id`,
        [account.ma_nguoi_dung, normalizedTitle],
      )) as Array<{ id: number }>;
      const requestId = created[0]?.id;
      if (!requestId) {
        throw new Error('Không tạo được yêu cầu hỗ trợ.');
      }
      await manager.query(
        `INSERT INTO ho_tro_tin_nhan (
           yeu_cau_id, sender_id, sender_role, sender_name, sender_email,
           noi_dung
         ) VALUES ($1, $2, 'ky-su', $3, $4, $5)`,
        [
          requestId,
          account.ma_nguoi_dung,
          account.ho_ten || account.ten_dang_nhap,
          account.email,
          normalizedMessage,
        ],
      );
      return Number(requestId);
    });
  }

  async replyToConversation(
    requestId: number,
    username: string,
    role: 'ky-su' | 'quan-tri-vien' | 'quan-ly-khu-vuc',
    message: string,
  ): Promise<void> {
    const normalizedMessage = this.validateText(
      message,
      MESSAGE_MAX_LENGTH,
      'Nội dung tin nhắn',
    );
    const account = await this.findSenderAccount(username, false);
    await this.repository.manager.transaction(async (manager) => {
      const conversation = (await manager.query(
        `SELECT id, engineer_id, recipient_id, loai_hoi_thoai
         FROM ho_tro_yeu_cau
         WHERE id = $1
         FOR UPDATE`,
        [requestId],
      )) as Array<{
        id: number;
        engineer_id: number;
        recipient_id: number | null;
        loai_hoi_thoai: 'admin' | 'ky-su';
      }>;
      const current = conversation[0];
      if (
        !current ||
        (role === 'ky-su' &&
          (current.loai_hoi_thoai === 'admin'
            ? current.engineer_id !== account.ma_nguoi_dung
            : ![current.engineer_id, current.recipient_id].includes(
                account.ma_nguoi_dung,
              ))) ||
        (role !== 'ky-su' && current.loai_hoi_thoai !== 'admin')
      ) {
        throw new NotFoundException('Không tìm thấy yêu cầu hỗ trợ.');
      }
      await manager.query(
        `INSERT INTO ho_tro_tin_nhan (
           yeu_cau_id, sender_id, sender_role, sender_name, sender_email,
           noi_dung
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          requestId,
          account.ma_nguoi_dung,
          role,
          account.ho_ten || account.ten_dang_nhap,
          account.email,
          normalizedMessage,
        ],
      );
      await manager.query(
        `UPDATE ho_tro_yeu_cau
         SET trang_thai = $2, ngay_cap_nhat = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          requestId,
          role === 'ky-su' ? 'cho_phan_hoi' : 'da_tra_loi',
        ],
      );
    });
  }

  private async findSenderAccount(username: string, requireEmail: boolean) {
    const rows = (await this.repository.manager.query(
      `SELECT ma_nguoi_dung, ten_dang_nhap, ho_ten, email
       FROM nguoi_dung
       WHERE ten_dang_nhap = $1`,
      [username],
    )) as Array<{
      ma_nguoi_dung: number;
      ten_dang_nhap: string;
      ho_ten: string | null;
      email: string | null;
    }>;
    const account = rows[0];
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản đang đăng nhập.');
    }
    if (requireEmail && !account.email?.trim()) {
      throw new BadRequestException(
        'Tài khoản kỹ sư chưa có Gmail. Vui lòng cập nhật Gmail trong hồ sơ trước khi gửi yêu cầu hỗ trợ.',
      );
    }
    return account;
  }

  private validateText(value: string, maxLength: number, label: string) {
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength) {
      throw new BadRequestException(
        `${label} không được để trống và tối đa ${maxLength} ký tự.`,
      );
    }
    return normalized;
  }
}
