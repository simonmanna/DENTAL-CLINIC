import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Short-lived, signed tokens that authorize reading uploaded files.
 *
 * Uploaded imaging is patient data, so it cannot be served as unauthenticated
 * static content. A browser cannot attach an Authorization header to an <img>
 * request either, so the client asks for one of these tokens over the
 * authenticated API and appends it to file URLs instead. The token is scoped to
 * file reads only, carries no privileges of its own, and expires quickly.
 */
@Injectable()
export class FileTokenService {
  /** How long a minted token stays valid. */
  static readonly TTL_SECONDS = 15 * 60;

  constructor(private readonly config: ConfigService) {}

  private key(): string {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) throw new Error('JWT_ACCESS_SECRET is not configured');
    return secret;
  }

  private sign(payload: string): string {
    return crypto
      .createHmac('sha256', this.key())
      .update(payload)
      .digest('base64url');
  }

  /** Mint a token for one user. Returns the token and its expiry in epoch ms. */
  mint(userId: string): { token: string; expiresAt: number } {
    const expSeconds =
      Math.floor(Date.now() / 1000) + FileTokenService.TTL_SECONDS;
    const payload = `${userId}.${expSeconds}`;
    const token = `${Buffer.from(payload).toString('base64url')}.${this.sign(payload)}`;
    return { token, expiresAt: expSeconds * 1000 };
  }

  /** Verify a token, returning the user id it was minted for, or null. */
  verify(token: string | undefined): string | null {
    if (!token) return null;

    const split = token.lastIndexOf('.');
    if (split <= 0) return null;

    const encodedPayload = token.slice(0, split);
    const signature = token.slice(split + 1);

    let payload: string;
    try {
      payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    } catch {
      return null;
    }

    const expected = this.sign(payload);
    const given = Buffer.from(signature);
    const want = Buffer.from(expected);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
      return null;
    }

    const dot = payload.lastIndexOf('.');
    if (dot <= 0) return null;
    const userId = payload.slice(0, dot);
    const expSeconds = Number(payload.slice(dot + 1));
    if (!Number.isFinite(expSeconds) || expSeconds * 1000 <= Date.now()) {
      return null;
    }

    return userId;
  }
}
