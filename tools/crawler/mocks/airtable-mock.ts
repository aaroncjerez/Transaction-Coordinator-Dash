/**
 * Airtable API Mock — Not used in primary strategy (disabled via empty API key).
 * Kept as reference for future record-replay capability.
 */

export function handleAirtableRequest(_url: string, _method: string): { status: number; body: any } | null {
  return { status: 200, body: { records: [] } };
}
