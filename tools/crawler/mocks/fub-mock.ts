/**
 * FUB API Mock — Not used in primary strategy (we disable FUB via empty API key).
 * Kept as reference for future record-replay capability.
 */

export const FUB_MOCK_PEOPLE = [
  {
    id: 1001,
    firstName: 'Test',
    lastName: 'Smith',
    stage: 'Purchase Agreement Signed',
    emails: [{ value: 'test.smith@example.com' }],
    phones: [{ value: '(512) 555-0001' }],
  },
];

export const FUB_MOCK_EVENTS: any[] = [];
export const FUB_MOCK_NOTES: any[] = [];

export function handleFubRequest(url: string, method: string, _body?: any): { status: number; body: any } | null {
  // Block stage pushes unconditionally
  if (method === 'PUT' && url.includes('/people/')) {
    return { status: 403, body: { error: 'BLOCKED: FUB stage pushes are forbidden in test mode' } };
  }

  if (url.includes('/people') && method === 'GET') {
    return { status: 200, body: { people: FUB_MOCK_PEOPLE, _metadata: { total: FUB_MOCK_PEOPLE.length } } };
  }

  if (url.includes('/events') && method === 'GET') {
    return { status: 200, body: { events: FUB_MOCK_EVENTS } };
  }

  if (url.includes('/notes') && method === 'GET') {
    return { status: 200, body: { notes: FUB_MOCK_NOTES } };
  }

  return null; // Unknown endpoint — block
}
