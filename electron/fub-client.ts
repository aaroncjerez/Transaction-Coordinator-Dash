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

/**
 * Fetch with automatic 429 retry (up to 3 attempts with exponential backoff).
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status !== 429 || attempt === maxRetries) return response;

    // Parse Retry-After header, default to exponential backoff
    const retryAfter = response.headers.get('Retry-After');
    const waitSec = retryAfter ? parseInt(retryAfter, 10) : Math.pow(2, attempt + 1);
    const waitMs = Math.min((isNaN(waitSec) ? 2 : waitSec) * 1000, 30_000);
    console.log(`[FubClient] 429 rate limit — retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  // Unreachable, but TypeScript needs it
  throw new Error('fetchWithRetry exhausted retries');
}

export interface FubConfig {
  apiKey: string;
  account: string; // subdomain, e.g. "jerezland"
}

export interface FubPerson {
  id: number;
  firstName?: string;
  lastName?: string;
  stage?: string;
  price?: number;
  emails?: Array<{ value: string; type?: string }>;
  phones?: Array<{ value: string; type?: string }>;
  addresses?: Array<{ value?: string; type?: string }>;
  // FUB custom fields (camelCase with 'custom' prefix)
  customDealType?: string | null;
  customDealID?: string | null;
  customCashOffer?: string | null;
  customDoubleCloseOffer?: string | null;
  customContractExecutionDate?: string | null;
  customContractEndDate?: string | null;
  customClosingDate?: string | null;
  customParcelCounty?: string | null;
  customParcelState?: string | null;
  customParcelNumber?: string | null;
  customParcelZip?: string | null;
  customParcelLink?: string | null;
  customLotAcreage?: string | null;
  customSellerSBottomPrice?: string | null;
  customRealtorPriceOpinion?: string | null;
  customMortgageOnProperty?: string | null;
  customHOAPOAOnProperty?: string | null;
  customTitleSearch?: string | null;
  customTitleExam?: string | null;
  customSurvey?: string | null;
  customSoilTest?: string | null;
  customTitleCompanyName?: string | null;
  customTitleCompanyPhone?: string | null;
  customTitleCompanyEmail?: string | null;
  customFunderName?: string | null;
  customRealtorName?: string | null;
  customDronePhotoLink?: string | null;
  customReferenceNumber?: string | null;
  customMiscellaneousDealExpenses?: string | null;
  customPurchasePrice?: string | null;
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

export interface FubCall {
  id: number;
  personId: number;
  isIncoming?: boolean;
  duration?: number;
  outcome?: string | null;
  phone?: string;
  fromNumber?: string;
  toNumber?: string;
  note?: string | null;
  recordingUrl?: string | null;
  userName?: string;
  startedAt?: string;
  created?: string;
  [key: string]: any;
}

export interface FubTextMessage {
  id: number;
  personId: number;
  isIncoming?: boolean;
  message?: string;
  fromNumber?: string;
  toNumber?: string;
  status?: string;
  deliveryStatus?: string;
  userName?: string;
  sent?: string;
  created?: string;
  media?: Array<{ url?: string; contentType?: string }>;
  [key: string]: any;
}

export interface FubEmail {
  id: number;
  personId: number;
  subject?: string;
  body?: string;
  isIncoming?: boolean;
  from?: string;
  to?: string;
  created?: string;
  [key: string]: any;
}

export interface DiscoveredAttachment {
  id: number;
  source: 'event' | 'note';
  sourceId: number;
}

// ==========================================
// FUB Deal Pipeline Types
// ==========================================

export interface FubPipelineStage {
  id: number;
  name: string;
  orderWeight?: number;
  [key: string]: any;
}

export interface FubPipeline {
  id: number;
  name: string;
  stages?: FubPipelineStage[];
  [key: string]: any;
}

export interface FubDeal {
  id: number;
  personId?: number;
  pipelineId?: number;
  stageId?: number;
  name?: string;
  price?: number;
  status?: string;
  closingDate?: string;
  possessionDate?: string;
  commissionValue?: number;
  commission?: number;
  agentCommission?: number;
  teamCommission?: number;
  customFields?: Record<string, any>;
  [key: string]: any;
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
  const response = await fetchWithRetry(`${FUB_API_BASE}/people/${personId}`, {
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
    const response = await fetchWithRetry(url, {
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
    const response = await fetchWithRetry(url, {
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

// ==========================================
// Person Sync Methods
// ==========================================

/**
 * Fetch ALL people from FUB (no stage filter, paginated).
 * GET /v1/people?limit=100&offset={offset}
 */
export async function fetchAllPeople(
  config: FubConfig,
  limit = 100,
  offset = 0
): Promise<{ people: FubPerson[]; total: number; hasMore: boolean }> {
  const url = `${FUB_API_BASE}/people?limit=${limit}&offset=${offset}&fields=allFields`;
  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: authHeader(config.apiKey),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`FUB GET /people failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const people: FubPerson[] = data.people || data.response || [];
  const total = data._metadata?.total || people.length;
  const nextOffset = data._metadata?.nextoffset;

  return {
    people,
    total,
    hasMore: !!nextOffset && people.length >= limit,
  };
}

/**
 * Fetch people from FUB by stage (paginated).
 * GET /v1/people?stage={stage}&limit=100&offset={offset}
 */
export async function fetchPeopleByStage(
  config: FubConfig,
  stage: string,
  limit = 100,
  offset = 0
): Promise<{ people: FubPerson[]; total: number; hasMore: boolean }> {
  const url = `${FUB_API_BASE}/people?stage=${encodeURIComponent(stage)}&limit=${limit}&offset=${offset}&fields=allFields`;
  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: authHeader(config.apiKey),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`FUB GET /people?stage=${stage} failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const people: FubPerson[] = data.people || data.response || [];
  const total = data._metadata?.total || people.length;
  const nextOffset = data._metadata?.nextoffset;

  return {
    people,
    total,
    hasMore: !!nextOffset && people.length >= limit,
  };
}

/**
 * Fetch ALL people across multiple stages (handles pagination).
 */
export async function fetchPeopleByStages(
  config: FubConfig,
  stages: string[],
  maxPagesPerStage = 10
): Promise<FubPerson[]> {
  const allPeople: FubPerson[] = [];
  const seenIds = new Set<number>();

  for (const stage of stages) {
    let offset = 0;
    for (let page = 0; page < maxPagesPerStage; page++) {
      try {
        const result = await fetchPeopleByStage(config, stage, 100, offset);
        for (const person of result.people) {
          if (!seenIds.has(person.id)) {
            seenIds.add(person.id);
            allPeople.push(person);
          }
        }
        if (!result.hasMore) break;
        offset += 100;
      } catch (err) {
        console.warn(`[FubClient] Error fetching people for stage "${stage}":`, err);
        break;
      }
    }
  }

  return allPeople;
}

/**
 * Update a person's stage in FUB.
 * PUT /v1/people/{id}
 */
export async function updatePersonStage(
  config: FubConfig,
  personId: number,
  stage: string
): Promise<boolean> {
  return updatePerson(config, personId, { stage });
}

/**
 * Update a person's fields in FUB.
 * PUT /v1/people/{id}
 * Accepts any partial person payload (stage, custom fields, etc.).
 */
export async function updatePerson(
  config: FubConfig,
  personId: number,
  fields: Record<string, any>
): Promise<boolean> {
  const url = `${FUB_API_BASE}/people/${personId}`;
  const response = await fetchWithRetry(url, {
    method: 'PUT',
    headers: {
      Authorization: authHeader(config.apiKey),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(fields),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[FubClient] updatePerson(${personId}) failed: ${response.status} ${text}`);
    return false;
  }

  return true;
}

/**
 * Create a note on a person's timeline in FUB.
 * POST /v1/notes
 */
export async function createNote(
  config: FubConfig,
  personId: number,
  subject: string,
  body: string
): Promise<FubNote | null> {
  const url = `${FUB_API_BASE}/notes`;
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(config.apiKey),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      personId,
      subject,
      body,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[FubClient] createNote(${personId}) failed: ${response.status} ${text}`);
    return null;
  }

  const data = await response.json();
  return data.response || data;
}

// ==========================================
// Activity Fetch Methods (calls, texts, emails)
// ==========================================

/**
 * Fetch calls for a person (paginated).
 * GET /v1/calls?personId={id}&limit=100&offset={offset}
 */
export async function fetchPersonCalls(
  config: FubConfig,
  personId: string | number,
  maxPages = 5
): Promise<FubCall[]> {
  const allCalls: FubCall[] = [];
  let offset = 0;
  const limit = 100;

  for (let page = 0; page < maxPages; page++) {
    const url = `${FUB_API_BASE}/calls?personId=${personId}&limit=${limit}&offset=${offset}`;
    const response = await fetchWithRetry(url, {
      headers: { Authorization: authHeader(config.apiKey), Accept: 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) break;
      throw new Error(`FUB GET /calls failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const calls: FubCall[] = data.calls || data.response || [];
    if (calls.length === 0) break;
    allCalls.push(...calls);
    if (calls.length < limit || !data._metadata?.nextoffset) break;
    offset = data._metadata.nextoffset;
  }

  return allCalls;
}

/**
 * Fetch text messages for a person (paginated).
 * GET /v1/textMessages?personId={id}&limit=100&offset={offset}
 */
export async function fetchPersonTexts(
  config: FubConfig,
  personId: string | number,
  maxPages = 5
): Promise<FubTextMessage[]> {
  const allTexts: FubTextMessage[] = [];
  let offset = 0;
  const limit = 100;

  for (let page = 0; page < maxPages; page++) {
    const url = `${FUB_API_BASE}/textMessages?personId=${personId}&limit=${limit}&offset=${offset}`;
    const response = await fetchWithRetry(url, {
      headers: { Authorization: authHeader(config.apiKey), Accept: 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) break;
      throw new Error(`FUB GET /textMessages failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const texts: FubTextMessage[] = data.textmessages || data.textMessages || data.response || [];
    if (texts.length === 0) break;
    allTexts.push(...texts);
    if (texts.length < limit || !data._metadata?.nextoffset) break;
    offset = data._metadata.nextoffset;
  }

  return allTexts;
}

/**
 * Fetch emails for a person (paginated).
 * GET /v1/emails?personId={id}&limit=100&offset={offset}
 */
export async function fetchPersonEmails(
  config: FubConfig,
  personId: string | number,
  maxPages = 5
): Promise<FubEmail[]> {
  const allEmails: FubEmail[] = [];
  let offset = 0;
  const limit = 100;

  for (let page = 0; page < maxPages; page++) {
    const url = `${FUB_API_BASE}/emails?personId=${personId}&limit=${limit}&offset=${offset}`;
    const response = await fetchWithRetry(url, {
      headers: { Authorization: authHeader(config.apiKey), Accept: 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) break;
      throw new Error(`FUB GET /emails failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const emails: FubEmail[] = data.emails || data.response || [];
    if (emails.length === 0) break;
    allEmails.push(...emails);
    if (emails.length < limit || !data._metadata?.nextoffset) break;
    offset = data._metadata.nextoffset;
  }

  return allEmails;
}

// ==========================================
// File Sync Methods (existing)
// ==========================================

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

  const response = await fetchWithRetry(url, {
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

// ==========================================
// Deal Pipeline Methods
// ==========================================

/**
 * Fetch all pipelines from FUB.
 * GET /v1/pipelines
 * Returns pipeline objects (may include stages inline depending on FUB version).
 */
export async function fetchPipelines(
  config: FubConfig
): Promise<FubPipeline[]> {
  const url = `${FUB_API_BASE}/pipelines`;
  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: authHeader(config.apiKey),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`FUB GET /pipelines failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.pipelines || data.response || [];
}

/**
 * Fetch a single pipeline with stages.
 * GET /v1/pipelines/{id}
 */
export async function fetchPipeline(
  config: FubConfig,
  pipelineId: number
): Promise<FubPipeline | null> {
  const url = `${FUB_API_BASE}/pipelines/${pipelineId}`;
  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: authHeader(config.apiKey),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`FUB GET /pipelines/${pipelineId} failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.response || data;
}

/**
 * Fetch deals for a person from FUB.
 * GET /v1/deals?personId={id}
 */
export async function fetchDealsByPerson(
  config: FubConfig,
  personId: number
): Promise<FubDeal[]> {
  const url = `${FUB_API_BASE}/deals?personId=${personId}`;
  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: authHeader(config.apiKey),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`FUB GET /deals?personId=${personId} failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.deals || data.response || [];
}

/**
 * Fetch a single deal from FUB.
 * GET /v1/deals/{id}
 */
export async function fetchDeal(
  config: FubConfig,
  dealId: number
): Promise<FubDeal | null> {
  const url = `${FUB_API_BASE}/deals/${dealId}`;
  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: authHeader(config.apiKey),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`FUB GET /deals/${dealId} failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const result = data.response || data;

  // Diagnostic: log raw deal keys to discover commission field names
  console.log(`[FubClient] fetchDeal(${dealId}) keys:`, Object.keys(result).join(', '));
  const moneyFields = Object.entries(result).filter(([k]) =>
    /commission|price|value|amount|profit|cost|revenue/i.test(k)
  );
  if (moneyFields.length > 0) {
    console.log(`[FubClient] fetchDeal(${dealId}) money-related:`, Object.fromEntries(moneyFields));
  }

  return result;
}

/**
 * Update a deal's stage in the FUB Deal Pipeline.
 * PUT /v1/deals/{id}
 */
export async function updateDealStage(
  config: FubConfig,
  dealId: number,
  stageId: number
): Promise<boolean> {
  const url = `${FUB_API_BASE}/deals/${dealId}`;
  const response = await fetchWithRetry(url, {
    method: 'PUT',
    headers: {
      Authorization: authHeader(config.apiKey),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ stageId }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[FubClient] updateDealStage(${dealId}, stageId=${stageId}) failed: ${response.status} ${text}`);
    return false;
  }

  return true;
}
