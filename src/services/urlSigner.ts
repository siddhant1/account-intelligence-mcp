import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-signed, expiring URLs (the same idea as S3 presigned URLs). A download
 * link works without an API key, but only for one resource and only until it
 * expires, so it can be safely opened in a browser or handed to a user.
 */
export class UrlSigner {
  constructor(
    private readonly secret: string,
    private readonly baseUrl: string,
  ) {}

  sign(pathname: string, expiresAt: Date): string {
    const expires = Math.floor(expiresAt.getTime() / 1000);
    const url = new URL(pathname, `${this.baseUrl}/`);
    url.searchParams.set('expires', String(expires));
    url.searchParams.set('signature', this.signature(pathname, expires));
    return url.toString();
  }

  /** Constant-time check that `signature` was issued by this server for `pathname` and `expires`. */
  verify(pathname: string, expires: number, signature: string): boolean {
    const expected = Buffer.from(this.signature(pathname, expires));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private signature(pathname: string, expires: number): string {
    return createHmac('sha256', this.secret).update(`${pathname}\n${expires}`).digest('base64url');
  }
}
