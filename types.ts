// ===== Core Domain Types =====

export type DealType = 'Standard Flip' | 'Double Close' | 'Subdivide';

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

export type TaskStatus = 'To Do' | 'In Progress' | 'Done' | 'Skipped';

export type FileCategory =
  | 'purchase_agreement'
  | 'funding_agreement'
  | 'deed'
  | 'plat'
  | 'soil_test'
  | 'hud'
  | 'sale_contract'
  | 'other';

export type AuditEventType =
  | 'stage_change'
  | 'task_created'
  | 'task_completed'
  | 'task_status_changed'
  | 'file_uploaded'
  | 'sync_completed'
  | 'ai_query'
  | 'deadline_alert'
  | 'deal_created'
  | 'fub_file_synced'
  | 'fub_file_sync_completed'
  | 'fub_file_sync_error'
  | 'fub_file_sync_mismatch';

export type FubPersonSyncStatusType = 'pending' | 'syncing' | 'synced' | 'error';

export interface FubPersonSyncState {
  fub_person_id: string;
  deal_id?: string;
  fub_stage?: string;
  last_synced_at?: string;
  status: FubPersonSyncStatusType;
  error?: string;
  created_at?: string;
  updated_at?: string;
}

// ===== Entity Interfaces =====

export interface Deal {
  id: string;
  airtable_id?: string;
  created_at?: string;
  updated_at?: string;
  deal_name: string;
  last_name?: string;
  deal_type: DealType;
  stage: DealStage;
  previous_stage?: string;
  county: string;
  state: string;
  notes?: string;
  purchase_price: number;
  expected_sales_price: number;
  contract_execution_date?: string;
  expected_close_date?: string;
  close_date?: string;
  days_to_close?: string;
  phone_number?: string;
  email?: string;
  assigned_to?: any;
  due_diligence_link?: string;
  fub_person_id?: string;
  // FUB custom fields
  contract_end_date?: string;
  parcel_number?: string;
  parcel_zip?: string;
  parcel_link?: string;
  lot_acreage?: string;
  seller_bottom_price?: number;
  double_close_offer?: number;
  realtor_price_opinion?: number;
  mortgage_on_property?: string;
  hoa_poa_on_property?: string;
  title_search?: string;
  title_exam?: string;
  survey?: string;
  soil_test?: string;
  title_company_name?: string;
  title_company_phone?: string;
  title_company_email?: string;
  funder_name?: string;
  realtor_name?: string;
  drone_photo_link?: string;
  reference_number?: string;
  misc_deal_expenses?: string;
  // Fee tracking (v13)
  transactional_funding_fee?: number;
  realtor_fee_percent?: number;
  realtor_fee_amount?: number;
  improvement_costs?: number;
  misc_fees?: number;
  // Jerez Land share (v14)
  jl_share_percent?: number;
  jl_share_amount?: number;
}

export interface Task {
  id: string;
  deal_id: string;
  source_rule_key?: string | null;
  title: string;
  description?: string;
  status: TaskStatus;
  assignee?: string;
  notes?: string;
  task_order?: number;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
  airtable_id?: string;
  // Joined fields (not in DB, populated by queries)
  deal?: Partial<Deal>;
}

export interface TaskReminder {
  id: string;
  task_id: string;
  remind_at: string;
  status: 'pending' | 'sent' | 'failed';
  error?: string | null;
  created_at?: string;
  sent_at?: string | null;
  // Joined fields
  title?: string;
  deal_id?: string;
  deal_name?: string;
}

export interface Deadline {
  id: string;
  deal_id: string;
  label: string;
  due_date: string;
  alert_schedule: AlertScheduleEntry[];
  is_acknowledged: boolean;
  created_at?: string;
}

export interface AlertScheduleEntry {
  offset_days: number;
  fired: boolean;
}

export type FileSource = 'local' | 'fub';

export interface FileRecord {
  id: string;
  deal_id: string;
  file_name: string;
  file_path: string;
  category?: FileCategory;
  sha256?: string;
  file_size?: number;
  uploaded_at?: string;
  source?: FileSource;
  fub_attachment_id?: string;
}

export type FubSyncStatus = 'pending' | 'syncing' | 'synced' | 'error' | 'mismatch';

export interface FubFileSyncState {
  deal_id: string;
  fub_person_id: string;
  last_synced_at?: string;
  last_status: FubSyncStatus;
  last_error?: string;
  local_file_count: number;
  fub_file_count: number;
  mismatched_files?: string[];
  updated_at?: string;
}

export interface PdfExtraction {
  id: number;
  deal_id: string;
  file_id?: string;
  file_name: string;
  file_path: string;
  category?: string;
  extracted_text?: string;
  summary?: string;
  key_findings?: string[];
  page_count: number;
  analyzed_at?: string;
}

export interface KbChunk {
  id: string;
  deal_id?: string;
  file_id?: string;
  content: string;
  chunk_index: number;
  token_count?: number;
  embedding?: string;
  created_at?: string;
}

export interface AuditEntry {
  id: number;
  deal_id?: string;
  event_type: AuditEventType;
  details?: string;
  created_at?: string;
}

export interface AppSetting {
  key: string;
  value: string;
  updated_at?: string;
}

// ===== AI Analysis Types =====

export interface DealAnalysis {
  id: number;
  deal_id: string;
  analysis: any;
  risk_score: number;
  recommendations: string[];
  analyzed_at?: string;
}

// ===== UI Helper Types =====

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface FilterConfig {
  status?: string | 'all';
  search: string;
}
