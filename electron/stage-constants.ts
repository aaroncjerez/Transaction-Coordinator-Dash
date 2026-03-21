/**
 * Stage constants for the Electron main process.
 * Mirrors the relevant parts of ../constants.ts to avoid cross-rootDir imports.
 * Keep in sync with constants.ts if stages change.
 */

export type DealStage =
  | 'Purchase Agreement Signed'
  | 'Due Diligence'
  | 'Send to escrow'
  | 'Purchase escrow'
  | 'Purchased'
  | 'Listed For Sale'
  | 'Sale escrow'
  | 'Sold'
  | 'Cancelled';

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
  'Closed': 'Sold',
  'Dead': 'Cancelled',
  'Nurture': 'Cancelled',
  'Trash': 'Cancelled',
};

/**
 * Reverse mapping: app stage → FUB stage name.
 * Used when PUSHING stage changes TO FUB. FUB silently ignores stage names
 * it doesn't recognize (returns 200 but doesn't change anything), so we must
 * send the exact FUB stage name.
 *
 * Only stages that differ from app names need entries here.
 * If an app stage isn't in this map, it's sent as-is (e.g. "Purchased", "Sold").
 */
// With app stage names now added to FUB, no translation needed for outgoing pushes.
// toFubStageName() falls back to the app stage name when the map is empty.
export const APP_TO_FUB_STAGE: Partial<Record<DealStage, string>> = {};

/**
 * Convert an app stage name to the FUB stage name for API pushes.
 * Falls back to the app stage if no mapping exists.
 */
export function toFubStageName(appStage: string): string {
  return APP_TO_FUB_STAGE[appStage as DealStage] || appStage;
}

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
  'Closed',
  'Dead',
  'Nurture',
  'Trash',
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
  // Unknown → filter out
  console.warn(`[StageMap] Unknown FUB stage: "${fubStage}"`);
  return null;
}

// ==========================================
// FUB Deal Pipeline Stage Mapping
// ==========================================

/**
 * App stage → FUB Deal Pipeline stage name.
 * The FUB Deal Pipeline uses different stage names than person stages.
 * Cancelled deals are not pushed to the pipeline.
 */
export const APP_TO_FUB_DEAL_STAGE: Record<string, string> = {
  'Purchase Agreement Signed': 'Purchase Contract',
  'Due Diligence': 'Hold',
  'Send to escrow': 'Purchase Pending',
  'Purchase escrow': 'Purchase Pending',
  'Purchased': 'Purchase Closed',
  'Listed For Sale': 'Listed',
  'Sale escrow': 'Pending Sale',
  'Sold': 'Sale Closed',
};

/**
 * FUB Deal Pipeline stage name → app stage.
 * Used for FUB→App reverse sync.
 * Note: "Purchase Pending" maps to "Send to escrow" (first of two app stages).
 */
export const FUB_DEAL_STAGE_TO_APP: Record<string, DealStage> = {
  'Purchase Contract': 'Purchase Agreement Signed',
  'Hold': 'Due Diligence',
  'Purchase Pending': 'Send to escrow',
  'Purchase Closed': 'Purchased',
  'Listed': 'Listed For Sale',
  'Pending Sale': 'Sale escrow',
  'Sale Closed': 'Sold',
};

/**
 * Convert an app stage to the FUB Deal Pipeline stage name.
 * Returns null for Cancelled (skip push).
 */
export function toFubDealStageName(appStage: string): string | null {
  return APP_TO_FUB_DEAL_STAGE[appStage] || null;
}

/**
 * Resolve a FUB Deal Pipeline stage name to an app DealStage.
 */
export function resolveFubDealStage(fubDealStageName: string): DealStage | null {
  return FUB_DEAL_STAGE_TO_APP[fubDealStageName] || null;
}

/**
 * Resolve an app stage to a FUB Deal Pipeline stageId (integer).
 * Reads from fub_pipeline_cache table (populated by refreshPipelineCache).
 * Returns null if cache is empty or stage not found.
 */
export function resolveDealStageId(db: any, appStage: string): number | null {
  const fubStageName = toFubDealStageName(appStage);
  if (!fubStageName) return null;

  const row = db.prepare(
    'SELECT stage_id FROM fub_pipeline_cache WHERE stage_name = ? LIMIT 1'
  ).get(fubStageName) as any;

  return row?.stage_id ?? null;
}

/**
 * Resolve a FUB stageId (integer) to an app DealStage.
 * Reads from fub_pipeline_cache.
 */
export function resolveStageIdToApp(db: any, stageId: number): DealStage | null {
  const row = db.prepare(
    'SELECT stage_name FROM fub_pipeline_cache WHERE stage_id = ? LIMIT 1'
  ).get(stageId) as any;

  if (!row?.stage_name) return null;
  return resolveFubDealStage(row.stage_name);
}
