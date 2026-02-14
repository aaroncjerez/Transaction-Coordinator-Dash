/**
 * Phone number utilities — ported from autodialer
 * Normalizes US phone numbers to 10-digit format for Supabase matching.
 */

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return digits;
}

export function formatPhone(phone: string | null | undefined): string {
  const digits = normalizePhone(phone);
  if (digits.length !== 10) return phone || '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function isValidPhone(phone: string | null | undefined): boolean {
  return normalizePhone(phone).length === 10;
}
