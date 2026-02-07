// ===== Core Domain Types =====

export type DealType = 'Standard Flip' | 'Double Close' | 'Subdivide';

export type DealStage =
  | 'Offer accepted'
  | 'Due Diligence'
  | 'Send to escrow'
  | 'Purchase escrow'
  | 'Purchased'
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

export type SyncJobStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

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
  assigned_to?: any;
  due_diligence_link?: string;
  fub_person_id?: string;
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

export interface SyncJob {
  id: number;
  entity_type: 'deal' | 'task';
  entity_id: string;
  action: 'create' | 'update' | 'delete';
  payload?: string;
  status: SyncJobStatus;
  attempts: number;
  max_attempts: number;
  error?: string;
  created_at?: string;
  completed_at?: string;
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
  airtable_id?: string;
  analysis: any;
  risk_score: number;
  recommendations: string[];
  analyzed_at?: string;
}

// ===== Daily Leads (kept from old schema) =====

export interface DailyLead {
  id: number;
  fub_id?: number;
  name?: string;
  stage?: string;
  score: number;
  summary?: string;
  rationale?: string;
  recommended_follow_up?: string;
  action_required: boolean;
  is_completed: boolean;
}

// ===== Market Analysis (kept from old schema) =====

export interface MarketAnalysis {
  id: number;
  state?: string;
  county?: string;
  zip_code?: string;
  acreage_range?: string;
  sold_1yr: number;
  sold_3mo: number;
  active_listings: number;
  absorption_rate: number;
  price_arbitrage_index: number;
  median_active_ppa: number;
  median_sold_ppa: number;
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

// ===== Legacy types (kept for backward compat during migration) =====

export type UserStatus = 'active' | 'inactive' | 'pending';
export type UserRole = 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastActive: string;
  projects: number;
}

export interface Metric {
  label: string;
  value: string;
  trend: number;
  trendDirection: 'up' | 'down' | 'neutral';
}

export interface ChartDataPoint {
  date: string;
  revenue: number;
  visitors: number;
  activeUsers: number;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  status: 'active' | 'churned' | 'lead';
  spent: string;
  lastOrder: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'in_progress' | 'completed' | 'paused' | 'planning';
  dueDate: string;
  budget: string;
  completion: number;
  members: number;
}
