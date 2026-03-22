/**
 * Mercury Bank API Client — Electron Main Process
 *
 * Fetches accounts, transactions, and statements from Mercury's REST API.
 * Auth: Bearer token from MERCURY_API_TOKEN env var.
 */

const BASE_URL = 'https://api.mercury.com/api/v1';

function getToken(): string {
  const token = process.env.MERCURY_API_TOKEN?.trim();
  if (!token) throw new Error('MERCURY_API_TOKEN not set in .env');
  return token;
}

async function mercuryFetch(path: string): Promise<any> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Mercury API ${res.status}: ${text}`);
  }
  return res.json();
}

// ---- Accounts ----

export interface MercuryAccount {
  id: string;
  accountNumber: string;
  routingNumber: string;
  name: string;
  status: string;
  kind: string;
  nickname: string | null;
  availableBalance: number;
  currentBalance: number;
  legalBusinessName: string;
  createdAt: string;
  dashboardLink: string;
}

export async function fetchAccounts(): Promise<MercuryAccount[]> {
  const data = await mercuryFetch('/accounts');
  return data.accounts || [];
}

// ---- Transactions ----

export interface MercuryTransaction {
  id: string;
  accountId: string;
  amount: number;
  counterpartyName: string | null;
  counterpartyId: string | null;
  note: string | null;
  bankDescription: string | null;
  externalMemo: string | null;
  kind: string; // outgoingPayment, incomingPayment, etc.
  status: string; // pending, sent, completed, failed, cancelled
  postedAt: string | null;
  createdAt: string;
  dashboardLink: string;
  mercuryCategory: string | null;
  categoryData: { id: string; name: string } | null;
}

export interface FetchTransactionsOpts {
  limit?: number;
  offset?: number;
  start?: string; // ISO date
  end?: string;   // ISO date
  status?: string;
  search?: string;
}

export async function fetchTransactions(
  accountId: string,
  opts: FetchTransactionsOpts = {},
): Promise<{ total: number; transactions: MercuryTransaction[] }> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  if (opts.start) params.set('start', opts.start);
  if (opts.end) params.set('end', opts.end);
  if (opts.status) params.set('status', String(opts.status));
  if (opts.search) params.set('search', opts.search);

  const qs = params.toString();
  const path = `/account/${accountId}/transactions${qs ? '?' + qs : ''}`;
  return mercuryFetch(path);
}

/**
 * Fetch ALL transactions for an account across pages.
 * Mercury uses offset-based pagination.
 */
export async function fetchAllTransactions(
  accountId: string,
  opts: Omit<FetchTransactionsOpts, 'limit' | 'offset'> = {},
  maxPages = 10,
): Promise<MercuryTransaction[]> {
  const all: MercuryTransaction[] = [];
  const pageSize = 100;

  for (let page = 0; page < maxPages; page++) {
    const data = await fetchTransactions(accountId, {
      ...opts,
      limit: pageSize,
      offset: page * pageSize,
    });
    all.push(...data.transactions);
    if (all.length >= data.total || data.transactions.length < pageSize) break;
  }

  return all;
}
