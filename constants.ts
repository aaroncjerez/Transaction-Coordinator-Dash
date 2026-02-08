import type { DealStage, DealType } from './types';

// ---- Stage Color System ----

export interface StageColor {
  bg: string;        // Solid bg class (e.g. 'bg-blue-500')
  text: string;      // Text color class on dark bg ('text-white')
  border: string;    // Border class ('border-blue-500')
  light: string;     // Light bg for badges/pills ('bg-blue-50')
  lightText: string;  // Text on light bg ('text-blue-700')
  topBorder: string; // Thin top border for column headers ('border-t-blue-500')
  hex: string;       // Raw hex for charts/inline styles
}

export const STAGE_COLORS: Record<DealStage, StageColor> = {
  'Purchase Agreement Signed': {
    bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-500',
    light: 'bg-blue-50', lightText: 'text-blue-700',
    topBorder: 'border-t-blue-500', hex: '#3b82f6',
  },
  'Due Diligence': {
    bg: 'bg-indigo-500', text: 'text-white', border: 'border-indigo-500',
    light: 'bg-indigo-50', lightText: 'text-indigo-700',
    topBorder: 'border-t-indigo-500', hex: '#6366f1',
  },
  'Send to escrow': {
    bg: 'bg-purple-500', text: 'text-white', border: 'border-purple-500',
    light: 'bg-purple-50', lightText: 'text-purple-700',
    topBorder: 'border-t-purple-500', hex: '#a855f7',
  },
  'Purchase escrow': {
    bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-500',
    light: 'bg-orange-50', lightText: 'text-orange-700',
    topBorder: 'border-t-orange-500', hex: '#f97316',
  },
  'Purchased': {
    bg: 'bg-amber-500', text: 'text-white', border: 'border-amber-500',
    light: 'bg-amber-50', lightText: 'text-amber-700',
    topBorder: 'border-t-amber-500', hex: '#f59e0b',
  },
  'Listed For Sale': {
    bg: 'bg-cyan-500', text: 'text-white', border: 'border-cyan-500',
    light: 'bg-cyan-50', lightText: 'text-cyan-700',
    topBorder: 'border-t-cyan-500', hex: '#06b6d4',
  },
  'Sale escrow': {
    bg: 'bg-teal-500', text: 'text-white', border: 'border-teal-500',
    light: 'bg-teal-50', lightText: 'text-teal-700',
    topBorder: 'border-t-teal-500', hex: '#14b8a6',
  },
  'Sold': {
    bg: 'bg-emerald-500', text: 'text-white', border: 'border-emerald-500',
    light: 'bg-emerald-50', lightText: 'text-emerald-700',
    topBorder: 'border-t-emerald-500', hex: '#10b981',
  },
  'Cancelled': {
    bg: 'bg-gray-500', text: 'text-white', border: 'border-gray-500',
    light: 'bg-gray-50', lightText: 'text-gray-700',
    topBorder: 'border-t-gray-500', hex: '#6b7280',
  },
};

const FALLBACK_STAGE_COLOR: StageColor = {
  bg: 'bg-slate-500', text: 'text-white', border: 'border-slate-500',
  light: 'bg-slate-50', lightText: 'text-slate-700',
  topBorder: 'border-t-slate-500', hex: '#64748b',
};

export function getStageColor(stage: string): StageColor {
  return STAGE_COLORS[stage as DealStage] ?? FALLBACK_STAGE_COLOR;
}

/** Pipeline stages — all except Cancelled (shown in Archive) */
export const PIPELINE_STAGES: DealStage[] = [
  'Purchase Agreement Signed',
  'Due Diligence',
  'Send to escrow',
  'Purchase escrow',
  'Purchased',
  'Listed For Sale',
  'Sale escrow',
  'Sold',
];

// ---- Core Stage & Type Lists ----

export const DEAL_STAGES: DealStage[] = [
  'Purchase Agreement Signed',
  'Due Diligence',
  'Send to escrow',
  'Purchase escrow',
  'Purchased',
  'Listed For Sale',
  'Sale escrow',
  'Sold',
  'Cancelled',
];

/** Set of valid app stages for quick lookup */
export const DEAL_STAGES_SET = new Set<string>(DEAL_STAGES);

export const DEAL_TYPES: DealType[] = [
  'Standard Flip',
  'Double Close',
  'Subdivide',
];

export const FILE_CATEGORIES = [
  { key: 'purchase_agreement', label: 'Purchase Agreement' },
  { key: 'funding_agreement', label: 'Funding Agreement' },
  { key: 'deed', label: 'Deed' },
  { key: 'plat', label: 'Plat' },
  { key: 'soil_test', label: 'Soil Test' },
  { key: 'hud', label: 'HUD' },
  { key: 'sale_contract', label: 'Sale Contract' },
  { key: 'other', label: 'Other' },
] as const;

export const TASK_STATUSES = ['To Do', 'In Progress', 'Done', 'Skipped'] as const;

export const STAGE_ORDER: Record<DealStage, number> = {
  'Purchase Agreement Signed': 0,
  'Due Diligence': 1,
  'Send to escrow': 2,
  'Purchase escrow': 3,
  'Purchased': 4,
  'Listed For Sale': 5,
  'Sale escrow': 6,
  'Sold': 7,
  'Cancelled': 8,
};

/**
 * Legacy FUB stage names → app stage (backwards compatibility).
 * FUB stages are being renamed to match app stages exactly.
 * This map handles any old stage names still in use.
 */
export const LEGACY_FUB_STAGE_MAP: Record<string, DealStage> = {
  'Offer accepted': 'Purchase Agreement Signed',
  'Renegotiation': 'Due Diligence',
  'Send To Escrow': 'Send to escrow',
  'Purchase Pending': 'Purchase escrow',
  'Closing': 'Purchase escrow',
  'Sale Pending': 'Sale escrow',
  'Dead': 'Cancelled',
};

/**
 * FUB stages to poll for person sync.
 * Includes all app stages (which are now the primary FUB stages)
 * plus legacy FUB stage names for backwards compatibility.
 */
export const QUALIFYING_FUB_STAGES: string[] = [
  // Primary stages (same as app stages)
  'Purchase Agreement Signed',
  'Due Diligence',
  'Send to escrow',
  'Purchase escrow',
  'Purchased',
  'Listed For Sale',
  'Sale escrow',
  'Sold',
  'Cancelled',
  // Legacy FUB stage names (backwards compat)
  'Offer accepted',
  'Renegotiation',
  'Purchase Pending',
  'Closing',
  'Sale Pending',
  'Dead',
];

/**
 * Resolve a FUB stage name to an app DealStage.
 * 1. If the FUB stage matches an app stage exactly → use it
 * 2. If it's in the legacy map → translate
 * 3. If "Trash" → return null (filter out)
 * 4. Otherwise → return null (unknown stage)
 */
export function resolveFubStage(fubStage: string): DealStage | null {
  // Exact match with app stage
  if (DEAL_STAGES_SET.has(fubStage)) {
    return fubStage as DealStage;
  }
  // Legacy mapping
  if (LEGACY_FUB_STAGE_MAP[fubStage]) {
    return LEGACY_FUB_STAGE_MAP[fubStage];
  }
  // Trash or unknown → filter out
  if (fubStage === 'Trash') return null;
  console.warn(`[StageMap] Unknown FUB stage: "${fubStage}"`);
  return null;
}
