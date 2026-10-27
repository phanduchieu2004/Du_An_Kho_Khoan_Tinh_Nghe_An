import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { LoginRoleSlug } from './vai-tro-dang-nhap.js';

export interface AuthSession {
  username: string;
  role: LoginRoleSlug;
  expiresAt: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    authSession?: AuthSession;
  }
}

const SESSION_DURATION_SECONDS = 8 * 60 * 60;
const LOGIN_ROLE_SLUGS = new Set<LoginRoleSlug>([
  'ky-su',
  'quan-tri-vien',
  'quan-ly-khu-vuc',
  'nguoi-xem-ban-do',
]);

@Injectable()
export class AuthSessionService {
  private readonly secret: string;

  constructor() {
    const configuredSecret = process.env.AUTH_SESSION_SECRET;
    if (!configuredSecret && process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SESSION_SECRET must be configured in production.');
    }
    this.secret = configuredSecret || randomBytes(32).toString('base64url');
  }

  create(username: string, role: LoginRoleSlug): string {
    const payload: AuthSession = {
      username,
      role,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );

    return `${encodedPayload}.${this.sign(encodedPayload)}`;
  }

  verify(token: string | undefined): AuthSession | null {
    if (!token) {
      return null;
    }

    const [encodedPayload, encodedSignature, extra] = token.split('.');
    if (!encodedPayload || !encodedSignature || extra !== undefined) {
      return null;
    }

    const expectedSignature = Buffer.from(this.sign(encodedPayload));
    const actualSignature = Buffer.from(encodedSignature);
    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      return null;
    }

    try {
      const payload: unknown = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      );
      if (!this.isValidPayload(payload)) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  private sign(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }

  private isValidPayload(value: unknown): value is AuthSession {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const payload = value as Record<string, unknown>;
    return (
      typeof payload.username === 'string' &&
      typeof payload.expiresAt === 'number' &&
      payload.expiresAt > Math.floor(Date.now() / 1000) &&
      typeof payload.role === 'string' &&
      LOGIN_ROLE_SLUGS.has(payload.role as LoginRoleSlug)
    );
  }
}
