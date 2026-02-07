/**
 * Stage constants for the Electron main process.
 * Mirrors the relevant parts of ../constants.ts to avoid cross-rootDir imports.
 * Keep in sync with constants.ts if stages change.
 */

export type DealStage =
  | 'Offer accepted'
  | 'Due Diligence'
  | 'Send to escrow'
  | 'Purchase escrow'
  | 'Purchased'
  | 'Sale escrow'
  | 'Sold'
  | 'Cancelled';

export const DEAL_STAGES: DealStage[] = [
  'Offer accepted',
  'Due Diligence',
  'Send to escrow',
  'Purchase escrow',
  'Purchased',
  'Sale escrow',
  'Sold',
  'Cancelled',
];

/** Set of valid app stages for quick lookup */
export const DEAL_STAGES_SET = new Set<string>(DEAL_STAGES);

export const STAGE_ORDER: Record<DealStage, number> = {
  'Offer accepted': 0,
  'Due Diligence': 1,
  'Send to escrow': 2,
  'Purchase escrow': 3,
  'Purchased': 4,
  'Sale escrow': 5,
  'Sold': 6,
  'Cancelled': 7,
};

/**
 * Legacy FUB stage names → app stage (backwards compatibility).
 * FUB stages are being renamed to match app stages exactly.
 * This map handles any old stage names still in use.
 */
export const LEGACY_FUB_STAGE_MAP: Record<string, DealStage> = {
  'Purchase Agreement Signed': 'Offer accepted',
  'Renegotiation': 'Due Diligence',
  'Send To Escrow': 'Send to escrow',
  'Purchase Pending': 'Purchase escrow',
  'Closing': 'Purchase escrow',
  'Listed For Sale': 'Sale escrow',
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
  'Offer accepted',
  'Due Diligence',
  'Send to escrow',
  'Purchase escrow',
  'Purchased',
  'Sale escrow',
  'Sold',
  'Cancelled',
  // Legacy FUB stage names (backwards compat)
  'Purchase Agreement Signed',
  'Renegotiation',
  'Purchase Pending',
  'Closing',
  'Listed For Sale',
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
