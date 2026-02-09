# TC Dash — Changes Log

## 2026-02-09 — KPI Dashboard Merged into Main

Merged `claude/mystifying-shaw` branch (6 commits) into `main`. Adds full KPI dashboard with team performance tracking, funnel visualization, goals, CEO weekly brief, and Airtable integration.

**Key additions:**
- `pages/KPIs.tsx` — KPI dashboard page with header, hero metrics, funnel, team cards, goals, insights
- `components/kpi/` — 15 KPI components (HeroKPI, FunnelFlow, TeamPerformance, GoalsDashboard, InsightsPanel, etc.)
- `components/kpi/ui/` — Reusable KPI UI primitives (ProgressBar, ProgressRing, MetricCard, StatCard, etc.)
- `lib/kpi/` — Calculations, types, constants, achievements, scale calculations, useCountUp hook
- `electron/kpi-airtable.ts` — Airtable SDK integration for weekly KPI data fetching
- `electron/kpi-ceo-brief.ts` — Claude-powered CEO weekly brief with forced tool calling
- Sidebar updated with KPIs nav entry
- New dependencies: `airtable`, `framer-motion`, `@radix-ui/react-avatar`, `@radix-ui/react-tooltip`

Also restored deleted files (`index.html`, `index.tsx`, `App.tsx`, `styles.css`, `contexts/PreferencesContext.tsx`) and fixed Dashboard.tsx `min-h-0` overflow issue.

---

## Prior Commits

### `17444d3` — feat: add CEO weekly brief, Maria conversations metric, and hot leads tracking

**Files changed (8):**

#### `lib/kpi/types.ts`
- Added `conversations?: number` to `TeamMember.targets` and `WeeklyKPI` interfaces
- Added `hotLeadsMetric?: { current: number; target: number }` to `TeamScorecard`
- Simplified `CEOPriority` from 5 fields (`focus`, `why`, `action`, `owner`, `impact`) to 2 fields (`title`, `detail`)

#### `lib/kpi/constants.ts`
- Added `conversations: 125` to Maria's targets (primary metric — conversations 60s+ per week)

#### `lib/kpi/calculations.ts`
- Changed cold_caller case from `callsMade` to `conversations` with tiered thresholds:
  - Green: ≥125, Yellow: ≥75, Red: <75, Crushing it: ≥200
- Added `hotLeadsMetric` for cold texters with flat target of 10 per week ($500K pace)
- Removed `HALF_MILLION_TARGETS` import (was causing double-division bug)

#### `electron/kpi-airtable.ts`
- Added `'Maria Cold Call Conversations'` field to Airtable record interface
- Added `conversations` mapping in Maria's parser entry

#### `electron/kpi-ceo-brief.ts`
- Completely rewritten with new CEO-level prompt persona
- Simplified tool schema to `{ title: string, detail: string }` per priority (3 exactly)
- New prompt: "You are the CEO of Jerez Land... Think like an owner"
- Max tokens reduced from 1500 to 800, temperature 0.3

#### `components/kpi/InsightsPanel.tsx`
- Removed expand/collapse UI (expandedIndex state, AnimatePresence, ChevronDown/Up)
- Removed HIGH/MEDIUM/LOW badges and color-coded priority cards
- Replaced with flat numbered list: purple circle (1,2,3) → bold title → detail paragraph
- Added Generate/Regenerate button in header row
- Consolidated from 3 separate return paths to single render

#### `components/kpi/TeamPerformance.tsx`
- Added hot leads section in expanded card for cold texters
- Shows "Hot Leads ($500K pace) X / 10" with colored progress bar

#### `pages/KPIs.tsx`
- Added `ceoBrief` and `isBriefLoading` state
- Added `generateBrief` callback wired to `fetchKpiCeoBrief(dashboardData)`
- Passes `onGenerate`, `isLoading`, `ceoBrief` to InsightsPanel

---

### `b97d40f` — fix: add null-safety guards across KPI UI components

8 KPI component files with null-safety fixes (from prior session).

---

## Uncommitted Changes

### Fix: CEO brief API key loading (`electron/kpi-ceo-brief.ts` + `electron/ipc-handlers.ts`)

**Bug:** Anthropic client was initialized at module load time with `process.env.ANTHROPIC_API_KEY`. The app stores the API key in the SQLite database (Settings page), not the env var. Client initialized with `undefined` → silent failure.

**Fix:**
- `electron/kpi-ceo-brief.ts` — Removed static client. `generateCEOBrief()` now accepts `apiKey: string` parameter, creates client per call.
- `electron/ipc-handlers.ts` — IPC handler reads API key from database (`SELECT value FROM settings WHERE key = 'anthropic_api_key'`), falls back to env var, passes to `generateCEOBrief()`.

### Fix: macOS traffic lights overlapping sidebar logo (`components/Sidebar.tsx`)

**Bug:** `titleBarStyle: 'hiddenInset'` keeps traffic lights at top-left. Sidebar logo had only `py-4` (16px) padding — not enough clearance.

**Fix:** Changed logo container from `py-4` to `pt-8 pb-4` (32px top padding).

---

## Key Architecture Notes

- **Electron + Vite + React + TypeScript**
- **Airtable SDK** with lazy initialization for KPI data
- **IPC pattern:** Renderer → preload → ipcMain → Airtable/Claude API
- **Claude Sonnet 4.5** with forced tool calling for structured JSON responses
- **API key loading:** Database setting `anthropic_api_key` → fallback `process.env.ANTHROPIC_API_KEY`
- **Maria cold caller metric:** conversations (60s+) replaces raw call volume. Tiers: Floor 75, Good 125, Strong 200, Elite 300+
- **Hot leads target:** 10/week per cold texter at $500K pace
- **CEO Brief:** 3 priorities with title + 1-2 sentence detail, written as CEO self-talk
