# Transaction Coordinator Dashboard — Audit Report

## Current Architecture (as of 2026-02-09)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Desktop shell | Electron 40 | Native macOS app with hidden title bar |
| Frontend | React 19 + Vite 6 + Tailwind 3 | SPA with route-based pages |
| Local DB | SQLite (better-sqlite3) | Deals, tasks, deadlines, settings |
| Deal source | Follow Up Boss API | Person sync (10s), file sync (5min) |
| KPI data | Airtable SDK | Weekly team metrics, live fetching |
| AI | Claude Sonnet (Anthropic) | CEO brief, deal chat, PDF analysis |

## Data Flow

1. **Deals:** FUB API -> Electron IPC -> SQLite -> React state
2. **KPIs:** Airtable -> Electron IPC -> React KPI components
3. **Tasks:** Rule engine generates tasks per deal stage, stored in SQLite
4. **Deadlines:** Auto-generated from deal dates, alert scheduler checks every 15min
5. **CEO Brief:** Dashboard data -> Claude tool call -> structured 3-priority output

## Previous Issues (Resolved)

- Supabase has been fully removed — all data is local SQLite + FUB API
- Airtable is no longer used for deal storage, only for KPI weekly metrics
- Native module version mismatch (better-sqlite3) resolved with electron-rebuild
- Deleted entry files (index.html, index.tsx, etc.) restored from git

## Health Status

- Database migrations: v14 (up to date)
- FUB person sync: running (10s interval)
- FUB file sync: running (5min interval)
- Alert scheduler: running (15min interval)
- KPI Airtable fetch: operational (live weekly data)
