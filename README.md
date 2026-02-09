# Transaction Coordinator Dashboard

Electron desktop app for managing real estate transaction coordination — deal pipeline, task engine, KPI tracking, and AI-powered insights.

## Stack

- **Electron** + **Vite** + **React 19** + **TypeScript**
- **SQLite** (better-sqlite3) for local deal/task storage
- **Airtable SDK** for KPI data (weekly team metrics)
- **Follow Up Boss API** for deal source & contact sync
- **Claude Sonnet** for CEO weekly brief generation & deal chat
- **Tailwind CSS 3** + Lucide icons + Framer Motion

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — quick stats, stage distribution, task progress, alerts |
| `/pipeline` | Kanban board — drag-and-drop deal stages |
| `/deals/:id` | Deal detail — financials, deadlines, tasks, files, AI chat |
| `/tasks` | Global task list with priority sorting and rule engine |
| `/kpis` | KPI dashboard — team performance, funnel, goals, CEO brief |
| `/analytics` | Charts and reporting |
| `/archive` | Closed/cancelled deals |
| `/settings` | API keys, preferences, FUB config |

## Run Locally

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev
```

This starts Vite on port 3000 and launches Electron once the server is ready.

## Environment

Create a `.env` file with:

```
ANTHROPIC_API_KEY=sk-ant-...
FUB_API_KEY=...
AIRTABLE_API_KEY=pat...
AIRTABLE_BASE_ID=app...
```

The Anthropic key can also be set in Settings within the app (stored in SQLite).

## Architecture

- **Renderer** (React) communicates with **Main** (Electron) via IPC
- **Preload** script exposes typed `window.electronAPI` bridge
- **FUB sync** runs on a 10-second interval for person data
- **File sync** runs on a 5-minute interval for FUB attachments
- **Alert scheduler** checks deadlines every 15 minutes
- **KPI data** pulled live from Airtable with weekly snapshots
- **CEO Brief** uses Claude with forced tool calling for structured 3-priority output
