# TC Dash — AI Dialer (Electron + React + Tailwind)

## Architecture

### Stack
- **Electron** (v40.2.1) desktop app with React frontend, Tailwind CSS, local SQLite (better-sqlite3)
- **Database**: `~/Library/Application Support/jerez-land-tc-data/tc-dash.db` (stable path, shared across dev/packaged)
- **IPC chain**: React component → `lib/database.ts` → preload.ts → ipc-handlers.ts → dialer-queries.ts → SQLite
- **Migrations**: `electron/migrations.ts` — currently at v29

### Build & Package
```bash
npm run build     # vite build + tsc -p electron/tsconfig.json
npm run package   # build + electron-builder --mac → release/Jerez-Land-TC-1.0.0.dmg
npm run dev       # concurrently vite + electron (dev mode)
npm start         # electron . (production mode, needs build first)
```

### Key Directories
- `pages/AIDialer.tsx` — Main dialer page (three-panel layout)
- `components/dialer/` — All dialer components
- `electron/dialer-queries.ts` — All SQLite queries for dialer
- `electron/dialer-sync.ts` — Background sync (10s inbound, 30s Retell poller, 60s full)
- `electron/ipc-handlers.ts` — IPC handler registrations
- `electron/migrations.ts` — DB schema migrations
- `lib/database.ts` — Renderer-side API wrappers

## AI Dialer UI

### Three-Panel Layout (Queue View)
1. **FilterSidebar** (w-56, left) — Hot leads, callbacks, list selector, geo filters, sort, filter toggles
2. **CallQueuePanel** (flex-1, center) — Lead table/cards with checkbox selection, call buttons
3. **Right Context Panel** (w-[400px]) — Campaign setup OR lead detail slide-over

### Views
- **Queue** — Main calling interface with filter sidebar
- **History** — Call history with search
- **Manage** — Upload, DNC, Cadence, Stats, Number Health accordions

### Campaign System
- Select leads via checkboxes (Top 10/25/50/100 quick-select)
- Right panel shows campaign setup with caller ID selection + throttle status
- Multi-number round-robin rotation with smart number selection
- **Spam prevention throttles**: 100 calls/number/day, 15 calls/number/hour (configurable per number)
- Auto-skips throttled numbers, auto-stops campaign when all numbers hit limits
- Never calls same person from same number twice (hard block, no override)
- Tracks `last_called_by` and `total_call_attempts` on each lead
- Progress bar with per-number stats during campaign
- Result grid (Dialed/Connected/Guarded/Failed) after completion

### Status Color Coding
- Gray (Ready) | Blue (Requested) | Yellow (In Progress) | Green (Connected) | Orange (No Answer) | Red (Failed)

## Database Schema (Dialer Tables)

| Table | Purpose |
|-------|---------|
| `dialer_lists` | Uploaded lead lists (id, name, lead_count) |
| `dialer_leads_cache` | All leads with call state, geo, rapport, cadence, priority, last_called_by, total_call_attempts |
| `dialer_call_records` | Call history (retell_call_id, seller_phone_normalized, our_phone, duration, transcript) |
| `dialer_dnc_cache` | Do-not-call phone numbers |
| `dialer_batch_dial_state` | Campaign session state (running/completed/failed) |
| `dialer_call_guard_log` | Blocked call audit log |
| `dialer_number_health` | Per-number connect rate, throttle limits (daily/hourly), pause state |
| `dialer_conversation_memory` | AI conversation context |
| `dialer_transcript_chunks` | Chunked transcripts for embeddings |

### Current Data (as of 2026-03-14)
- 1 list: **PikeMSJZSR** (id: `list_1773508457271_xgkvlg`, 678 leads)
- 878 DNC entries
- 95 call records
- ~662 leads available to call (after DNC + guard filters)

## Critical Bug Fixes Applied

### SQL NOT IN with NULL (2026-03-14) — CRITICAL
**Problem**: `NOT IN (SELECT seller_phone_normalized ...)` returned 0 results because 4 call records had NULL `seller_phone_normalized`. SQL evaluates `NOT IN` as UNKNOWN when subquery returns any NULL, filtering out ALL rows.
**Fix**: Added `AND seller_phone_normalized IS NOT NULL AND seller_phone_normalized != ''` to all 4 `NOT IN` subqueries in `getCallQueue()` and `getLeadsByList()`.
**Files**: `electron/dialer-queries.ts` (lines ~248-260, ~276-288)

### IPC Event Listener Memory Leaks (2026-03-14) — CRITICAL
**Problem**: All 7 IPC listener functions in preload.ts returned void, causing accumulated listeners on component remount.
**Fix**: All listeners now return cleanup functions through entire chain (preload → database.ts → component useEffect).
**Files**: `electron/preload.ts`, `electron/electron.d.ts`, `lib/database.ts`, all dialer components

### Batch Dial Race Condition (2026-03-14) — CRITICAL
**Problem**: No dedup for concurrent batch requests to same phone.
**Fix**: Module-level `activeDialingPhones` Set in `dialer-queries.ts`.

### Batch State Not Updated on Crash (2026-03-14)
**Problem**: batchDialLeads() crash left state as 'running' forever.
**Fix**: try/catch wrapping that marks state as 'failed'.

### Missing retell_call_id Index (2026-03-14)
**Fix**: Migration v26 adding unique index on `dialer_call_records(retell_call_id)`.

### Same-Number Repeat Calling (2026-03-14) — CRITICAL
**Problem**: During campaigns with `forceOverride: true`, the same person could be called from the same outbound number again. Any call from any number should count as a cadence touch.
**Fix**:
1. Added `same_number_used` guard reason — checks `dialer_call_records` for prior calls from the same `our_phone` to the same `seller_phone_normalized`. This guard can NEVER be force-overridden.
2. Batch dial now does round-robin same-number dedup: if the assigned number already called a person, it tries the next number. If ALL numbers have called them, the lead is skipped.
3. `callWithRetry` no longer hardcodes `forceOverride: true` — passes through the batch-level setting.
4. Migration v28 adds composite index `(seller_phone_normalized, our_phone)` for fast dedup lookups.
**Files**: `electron/dialer-queries.ts`, `electron/migrations.ts`

## Debugging Checklist

1. **0 leads in queue** → Check for NULL `seller_phone_normalized` in `dialer_call_records`. The `NOT IN` with NULL bug can return 0 results.
2. **Event listener buildup** → Verify all `on*` functions return cleanup functions, and components call them in useEffect return.
3. **Batch dial stuck as 'running'** → Check `dialer_batch_dial_state` table. Manual fix: `UPDATE dialer_batch_dial_state SET status = 'failed' WHERE status = 'running'`
4. **App shows stale data** → Force sync button in command bar, or check background sync intervals.
5. **Packaged app not reflecting changes** → Must `npm run package` after code changes. Verify fix in asar: `npx asar extract ... && grep`
6. **DB path confusion** → Always uses `~/Library/Application Support/jerez-land-tc-data/tc-dash.db` regardless of dev/packaged mode.
7. **Campaign not starting** → Need at least 1 lead selected AND 1 caller ID number selected.

## Retell AI Integration

- **API**: `POST /v2/create-phone-call` (per-call `from_number` for round-robin)
- **Batch API**: `POST /create-batch-call` (single from_number only — not used for multi-number campaigns)
- **Phone numbers**: Fetched via Retell API, stored in state, shown in command bar dropdown
- **Poller**: 30s interval, fetches calls since last poll, updates `dialer_call_records`
- **Call Guard**: DNC check → **same-number dedup (HARD block, never overridable)** → final outcome → real conversation (30s+) → 24h recency → cadence timing
- **Number Health**: `getNumberHealthStats()` — 24h window, connect rate, flagged if < threshold

## IPC Listener Pattern
```typescript
// preload.ts — returns cleanup function
onSomeEvent: (callback: (data: any) => void) => {
  const handler = (_event: any, data: any) => callback(data);
  ipcRenderer.on('channel', handler);
  return () => { ipcRenderer.removeListener('channel', handler); };
},

// database.ts — passes through
export function onSomeEvent(callback: ...): () => void {
  return api.dialer.onSomeEvent(callback);
}

// Component — calls cleanup on unmount
useEffect(() => {
  const unsub = onSomeEvent((data) => { ... });
  return () => unsub();
}, []);
```

## Known Minor Issues
- `getHotLeads()` doesn't filter `final_outcome IS NULL` — may show finalized hot leads
- `getCallbacksDue()` doesn't filter DNC — may show DNC'd callbacks
- 40 orphan leads with no `list_id` (legacy data, harmless)
