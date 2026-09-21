import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const [local, domain] = email.split('@');
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return email;
  return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
}

export function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map(normalizeEmail);
}

/** Shared passcode for the email+PIN fallback sign-in (see api/pinSession.ts). Unset = disabled. */
export function getLoginPin(): string | null {
  const pin = process.env.LOGIN_PIN;
  return pin && pin.length > 0 ? pin : null;
}

export function verifyPin(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sign(payload: string): string {
  if (!SESSION_SECRET) throw new Error('SESSION_SECRET is not configured');
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

export function mintSession(email: string): string {
  const payload = JSON.stringify({ email, exp: Date.now() + SESSION_TTL_MS });
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifySession(token: string | undefined | null): string | null {
  if (!token || !SESSION_SECRET) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expected = sign(encoded);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { email, exp } = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (typeof email !== 'string' || typeof exp !== 'number' || exp < Date.now()) return null;
    return email;
  } catch {
    return null;
  }
}

export async function verifyGoogleIdToken(idToken: string): Promise<{ email: string; email_verified: string; aud: string }> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw new Error('Could not verify Google ID token');
  return (await res.json()) as { email: string; email_verified: string; aud: string };
}
