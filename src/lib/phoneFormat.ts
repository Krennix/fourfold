/** Formats digits as a US-style phone number while typing: "5551234567" -> "(555) 123-4567".
 * Idempotent on its own output (re-formatting a formatted string is a no-op), so it's safe to
 * call on every keystroke. Supports an optional leading "1" country code ("+1 (555) 123-4567"). */
export function formatPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  const hasCountryCode = digits.length === 11 && digits[0] === '1';
  const local = hasCountryCode ? digits.slice(1) : digits.slice(0, 10);
  const prefix = hasCountryCode ? '+1 ' : '';
  if (local.length === 0) return '';
  if (local.length < 4) return `${prefix}(${local}`;
  if (local.length < 7) return `${prefix}(${local.slice(0, 3)}) ${local.slice(3)}`;
  return `${prefix}(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/** Strips a formatted phone number down to a `tel:`-safe value (digits and a leading +). */
export function phoneToTelHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
