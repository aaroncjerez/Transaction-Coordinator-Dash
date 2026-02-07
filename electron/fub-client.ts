/**
 * Follow Up Boss API Client
 *
 * Stateless HTTP client for FUB REST API.
 * Auth: HTTP Basic (API key as username, empty password).
 *
 * Key endpoints:
 * - GET /v1/people/{id} — person record
 * - GET /v1/events?personId={id} — timeline events (may reference attachments)
 * - GET /v1/notes?personId={id} — notes (may have attachments)
 * - GET /personAttachments/{id}?redirect=true — download attachment file
 *
 * Attachment discovery: No "list all attachments" endpoint exists.
 * We scan events + notes for attachment URL references matching
 * `personAttachments/{id}` and extract the IDs.
 */

import type Database from 'better-sqlite3';

const FUB_API_BASE = 'https://api.followupboss.com/v1';

export interface FubConfig {
  apiKey: string;
  account: string; // subdomain, e.g. "jerezland"
}

export interface FubPerson {
  id: number;
  firstName?: string;
  lastName?: string;
  emails?: Array<{ value: string; type?: string }>;
  phones?: Array<{ value: string; type?: string }>;
  [key: string]: any;
}

export interface FubEvent {
  id: number;
  personId: number;
  type?: string;
  description?: string;
  body?: string;
  created?: string;
  [key: string]: any;
}

export interface FubNote {
  id: number;
  personId: number;
  body?: string;
  subject?: string;
  created?: string;
  attachments?: Array<{ id: number; uri?: string; name?: string }>;
  [key: string]: any;
}

export interface DiscoveredAttachment {
  id: number;
  source: 'event' | 'note';
  sourceId: number;
}

/**
 * Build the Basic auth header for FUB API.
 * FUB uses API key as username with empty password.
 */
function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(apiKey + ':').toString('base64')}`;
}

/**
 * Get FUB configuration from settings table → env fallback.
 */
export function getFubConfig(db: Database.Database): FubConfig | null {
  const apiKeySetting = db.prepare(
    "SELECT value FROM settings WHERE key = 'fub_api_key'"
  ).get() as any;
  const accountSetting = db.prepare(
    "SELECT value FROM settings WHERE key = 'fub_account_name'"
  ).get() as any;

  const apiKey = apiKeySetting?.value || process.env.FUB_API_KEY;
  const account = accountSetting?.value || process.env.FUB_ACCOUNT_NAME || 'jerezland';

  if (!apiKey) return null;
  return { apiKey, account };
}

/**
 * Fetch a person record from FUB.
 */
export async function fetchPerson(
  config: FubConfig,
  personId: string | number
): Promise<FubPerson | null> {
  const response = await fetch(`${FUB_API_BASE}/people/${personId}`, {
    headers: {
      Authorization: authHeader(config.apiKey),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`FUB GET /people/${personId} failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.response || data;
}

/**
 * Fetch events for a person (paginated). Scans for attachment references.
 *
 * FUB events API: GET /v1/events?personId={id}&limit=100&offset={offset}
 */
export async function fetchPersonEvents(
  config: FubConfig,
  personId: string | number,
  maxPages = 10
): Promise<FubEvent[]> {
  const allEvents: FubEvent[] = [];
  let offset = 0;
  const limit = 100;

  for (let page = 0; page < maxPages; page++) {
    const url = `${FUB_API_BASE}/events?personId=${personId}&limit=${limit}&offset=${offset}`;
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader(config.apiKey),
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) break;
      throw new Error(`FUB GET /events failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const events: FubEvent[] = data.events || data.response || [];

    if (events.length === 0) break;

    allEvents.push(...events);

    // Check if more pages exist
    if (events.length < limit || !data._metadata?.nextoffset) break;
    offset = data._metadata.nextoffset;
  }

  return allEvents;
}

/**
 * Fetch notes for a person (paginated).
 */
export async function fetchPersonNotes(
  config: FubConfig,
  personId: string | number,
  maxPages = 10
): Promise<FubNote[]> {
  const allNotes: FubNote[] = [];
  let offset = 0;
  const limit = 100;

  for (let page = 0; page < maxPages; page++) {
    const url = `${FUB_API_BASE}/notes?personId=${personId}&limit=${limit}&offset=${offset}`;
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader(config.apiKey),
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) break;
      throw new Error(`FUB GET /notes failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const notes: FubNote[] = data.notes || data.response || [];

    if (notes.length === 0) break;

    allNotes.push(...notes);

    if (notes.length < limit || !data._metadata?.nextoffset) break;
    offset = data._metadata.nextoffset;
  }

  return allNotes;
}

/**
 * Extract attachment IDs from text content.
 *
 * Scans for patterns like:
 * - personAttachments/123
 * - personAttachments/{id}?redirect=true
 * - /api/v1/personAttachments/456
 */
function extractAttachmentIds(text: string): number[] {
  if (!text) return [];
  const regex = /personAttachments\/(\d+)/g;
  const ids = new Set<number>();
  let match;
  while ((match = regex.exec(text)) !== null) {
    ids.add(parseInt(match[1], 10));
  }
  return Array.from(ids);
}

/**
 * Discover all attachment IDs for a person by scanning events and notes.
 *
 * Returns unique attachment IDs with their source (event or note).
 */
export async function discoverAttachments(
  config: FubConfig,
  personId: string | number
): Promise<DiscoveredAttachment[]> {
  const discovered = new Map<number, DiscoveredAttachment>();

  // 1. Scan events
  try {
    const events = await fetchPersonEvents(config, personId);
    for (const event of events) {
      // Check event body, description, and any string fields
      const textToScan = [
        event.body,
        event.description,
        JSON.stringify(event),
      ].filter(Boolean).join(' ');

      const ids = extractAttachmentIds(textToScan);
      for (const id of ids) {
        if (!discovered.has(id)) {
          discovered.set(id, { id, source: 'event', sourceId: event.id });
        }
      }
    }
  } catch (err) {
    console.warn(`[FubClient] Error scanning events for person ${personId}:`, err);
  }

  // 2. Scan notes
  try {
    const notes = await fetchPersonNotes(config, personId);
    for (const note of notes) {
      // Check note body and attachment array
      const textToScan = [
        note.body,
        note.subject,
        JSON.stringify(note.attachments),
        JSON.stringify(note),
      ].filter(Boolean).join(' ');

      const ids = extractAttachmentIds(textToScan);
      for (const id of ids) {
        if (!discovered.has(id)) {
          discovered.set(id, { id, source: 'note', sourceId: note.id });
        }
      }

      // Also check explicit attachment objects
      if (note.attachments) {
        for (const att of note.attachments) {
          if (att.id && !discovered.has(att.id)) {
            discovered.set(att.id, { id: att.id, source: 'note', sourceId: note.id });
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[FubClient] Error scanning notes for person ${personId}:`, err);
  }

  return Array.from(discovered.values());
}

/**
 * Download an attachment file from FUB.
 *
 * Uses the account-scoped download URL:
 * https://{account}.followupboss.com/api/v1/personAttachments/{id}?redirect=true
 *
 * Returns the file buffer and inferred file name.
 */
export async function downloadAttachment(
  config: FubConfig,
  attachmentId: number
): Promise<{ buffer: Buffer; fileName: string } | null> {
  const url = `https://${config.account}.followupboss.com/api/v1/personAttachments/${attachmentId}?redirect=true`;

  const response = await fetch(url, {
    headers: {
      Authorization: authHeader(config.apiKey),
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    if (response.status === 404 || response.status === 403) {
      console.warn(`[FubClient] Attachment ${attachmentId} not accessible: ${response.status}`);
      return null;
    }
    throw new Error(`FUB download attachment ${attachmentId} failed: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Try to get filename from Content-Disposition header
  let fileName = `fub-attachment-${attachmentId}`;
  const disposition = response.headers.get('content-disposition');
  if (disposition) {
    const match = disposition.match(/filename[*]?=["']?(?:UTF-\d['"]*)?([^"';\n]+)/i);
    if (match) {
      fileName = match[1].trim();
    }
  }

  // Fallback: try to infer extension from content-type
  if (!fileName.includes('.')) {
    const contentType = response.headers.get('content-type');
    const extMap: Record<string, string> = {
      'application/pdf': '.pdf',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'text/plain': '.txt',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    };
    const ext = contentType ? extMap[contentType] : null;
    if (ext) fileName += ext;
  }

  return { buffer, fileName };
}
