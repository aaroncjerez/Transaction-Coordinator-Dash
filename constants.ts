import type { DealStage, DealType } from './types';

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
  'Offer accepted': 0,
  'Due Diligence': 1,
  'Send to escrow': 2,
  'Purchase escrow': 3,
  'Purchased': 4,
  'Sale escrow': 5,
  'Sold': 6,
  'Cancelled': 7,
};
