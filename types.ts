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
  realized_gross_profit?: number;
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

// ===== Lead Types =====

export type MotivationFactorType =
  | 'financial_distress' | 'divorce' | 'inheritance'
  | 'relocation' | 'property_condition' | 'urgency' | 'other';

export type NegotiationApproach =
  | 'empathetic' | 'business-like' | 'solution-focused' | 'opportunistic';

export type PriceRange = '60-70%' | '70-80%' | '80-90%' | 'market_value';

export type NegotiationTimeline = 'immediate' | '1-2_weeks' | '1_month' | 'flexible';

export interface MotivationFactor {
  factor: MotivationFactorType;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
}

export interface NegotiationStrategy {
  approach: NegotiationApproach;
  keyPoints: string[];
  priceRange: PriceRange;
  timeline: NegotiationTimeline;
}

export interface DailyLead {
  id: number;
  fub_id: number;
  name: string;
  stage?: string;
  source?: string;
  score: number;
  summary?: string;
  rationale?: string;
  recommended_follow_up?: string;
  action_required: boolean;
  is_completed: boolean;
  last_analyzed_at?: string;
  last_communication?: string;
  fub_link?: string;
  phone?: string;
  email?: string;
  contacted_today?: string;
  discount_likelihood?: number;
  motivation_factors?: MotivationFactor[];
  negotiation_strategy?: NegotiationStrategy;
  created_at?: string;
  updated_at?: string;
  // Computed (not stored)
  _priorityScore?: number;
}

// ===== AI Dialer Types (Supabase) =====

export type DialerCallDirection = 'inbound' | 'outbound';
export type DialerCallStatus = 'completed' | 'no_answer' | 'voicemail' | 'busy' | 'failed' | 'declined' | 'transferred';
export type DialerSentiment = 'positive' | 'neutral' | 'negative' | 'unknown';
export type DialerRapportLevel = 'cold' | 'warming' | 'warm' | 'hot';
export type DialerFinalOutcome = 'DNC' | 'Deal Made' | 'Under Contract' | 'Not Interested' | 'Dead Lead' | 'Exhausted' | 'Cadence Complete' | null;

export interface DialerLead {
  id: string;
  airtable_record_id: string;
  phone_number: string;
  phone_normalized: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  county: string | null;
  state: string | null;
  parcel_acres: number | null;
  property_address: string | null;
  market_value: number | null;
  final_outcome: DialerFinalOutcome;
  ai_cadence_on: boolean;
  attempt_count: number;
  max_attempts: number;
  seller_asking_price: number | null;
  our_last_offer: number | null;
  agreed_price: number | null;
  callback_requested: boolean;
  callback_datetime: string | null;
  rapport_level: DialerRapportLevel;
  cadence_stage: number | null;
  cadence_sequence: string | null;
  next_call_date: string | null;
  dnc_type: 'permanent' | 'temporary' | null;
  dnc_expires_at: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DialerCallRecord {
  id: string;
  lead_id: string | null;
  phone_normalized: string;
  seller_phone_normalized: string | null;
  our_phone: string | null;
  call_direction: DialerCallDirection;
  retell_call_id: string | null;
  call_started_at: string;
  call_ended_at: string | null;
  duration_seconds: number | null;
  call_status: DialerCallStatus | null;
  call_successful: boolean;
  sentiment: DialerSentiment | null;
  disconnection_reason: string | null;
  transcript: string | null;
  summary: string | null;
  custom_analysis: any | null;
  extracted_data: DialerExtractedData | null;
  cost_cents: number | null;
  created_at: string;
  // Joined lead info
  leads_cache?: {
    first_name: string | null;
    last_name: string | null;
    county: string | null;
    state: string | null;
  } | null;
}

export interface DialerExtractedData {
  property?: {
    county?: string;
    state?: string;
    acres?: number;
    apn?: string;
  };
  seller?: {
    caller_name?: string;
    why_selling?: string;
    timeline?: string;
  };
  price?: {
    seller_asking_price?: number;
    our_offer?: number;
    counter_offer?: number;
    agreed_price?: number;
  };
  outcome?: {
    deal_status?: string;
    callback_requested?: boolean;
    callback_datetime?: string;
    requested_dnc?: boolean;
    deal_made?: boolean;
  };
}

export interface DialerConversationMemory {
  id: string;
  phone_normalized: string;
  conversation_summary: string | null;
  key_facts: Record<string, unknown>;
  rapport_level: DialerRapportLevel;
  total_calls: number;
  last_interaction_at: string | null;
  last_interaction_summary: string | null;
  next_action_strategy: string | null;
  topics_to_mention: string[] | null;
  topics_to_avoid: string[] | null;
}

export interface DialerDNCEntry {
  id: string;
  record_type: 'lead' | 'airtable' | 'fub' | 'manual';
  phone_normalized: string;
  first_name: string | null;
  last_name: string | null;
  county: string | null;
  state: string | null;
  source: 'Auto-Detected' | 'Not Interested' | 'Airtable DNC' | 'Follow Up Boss' | 'Manually Uploaded';
  reason: string | null;
  added_at: string | null;
  dnc_type: 'permanent' | 'temporary' | null;
  dnc_expires_at: string | null;
}

export interface DialerDNCStats {
  total: number;
  autoDetected: number;
  fub: number;
  manual: number;
}

export interface DialerDailyStats {
  call_date: string;
  total_calls: number;
  outbound_calls: number;
  inbound_calls: number;
  successful_calls: number;
  positive_calls: number;
  neutral_calls: number;
  negative_calls: number;
  voicemails: number;
  no_answers: number;
  avg_call_duration: number;
  unique_leads: number;
}

export interface DialerHotLead extends DialerLead {
  conversation_summary: string | null;
  key_facts: Record<string, unknown> | null;
  next_action_strategy: string | null;
  total_calls: number;
  heat_level: number;
}

export interface DialerCallQueueLead extends DialerLead {
  priority_score: number;
  priority_reason: string;
  can_call_now: boolean;
  has_market_value: boolean;
  in_follow_up_boss: boolean;
}

export interface DialerCallbackWithDetails {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_normalized: string;
  county: string | null;
  state: string | null;
  callback_datetime: string;
  callback_completed: boolean | null;
  rapport_level: DialerRapportLevel;
  final_outcome: string | null;
  call_id: string | null;
  summary: string | null;
  sentiment: DialerSentiment | null;
}

export interface AICallReview {
  dnc_detected: boolean;
  dnc_evidence: string | null;
  sentiment: DialerSentiment;
  is_hot_lead: boolean;
  hot_lead_reason: string | null;
  call_quality_score: number;
  key_insights: string[];
  recommended_next_action: string;
  flags: string[];
}

// ===== CSV Upload Types =====

export interface UploadLeadRow {
  phone_number: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  county?: string;
  state?: string;
  parcel_acres?: number;
  market_value?: number;
  property_address?: string;
  property_city?: string;
  property_zip?: string;
  parcel_number?: string;
  min_offer?: number;
  max_offer?: number;
  labels?: string;
  notes?: string;
  lead_source?: string;
  acquired_by?: string;
}

export interface UploadLeadResult {
  row_index: number;
  lead_id: string | null;
  action: 'inserted' | 'updated' | 'skipped' | 'error';
  reason: string | null;
  phone: string;
}

export interface UploadBatchResult {
  batch_id: string;
  total_rows: number;
  imported: number;
  duplicates: number;
  errors: number;
  skipped: number;
  details: UploadLeadResult[];
}

// ===== Batch Auto-Dial Types =====

export type BatchDialStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

export interface BatchDialProgress {
  sessionId: string;
  status: BatchDialStatus;
  totalLeads: number;
  dialedCount: number;
  currentBatch: number;
  totalBatches: number;
  currentLeadName: string | null;
  errors: number;
  skippedDnc: number;
  skippedGuard?: number;
}

export interface BatchDialResult {
  sessionId: string;
  totalLeads: number;
  dialed: number;
  connected: number;
  failed: number;
  skippedDnc: number;
  skippedGuard?: number;
  durationSeconds: number;
  details: Array<{
    leadId: string;
    phone: string;
    status: 'dialed' | 'dnc_skipped' | 'guard_blocked' | 'error';
    callId?: string;
    error?: string;
    guardReason?: string;
    guardDetails?: string;
  }>;
}

// ===== Call Guard Types =====

export type CallGuardBlockReason =
  | 'dnc_listed'
  | 'final_outcome_set'
  | 'real_conversation'
  | 'called_recently'
  | 'cadence_not_due';

export interface CallGuardVerdict {
  allowed: boolean;
  reason: CallGuardBlockReason | null;
  details: string | null;
  matchedCallId?: string;
  matchedCallDate?: string;
  matchedDuration?: number;
  matchedOutcome?: string;
}

export interface CallGuardLogEntry {
  id: number;
  lead_id: string | null;
  phone_normalized: string;
  lead_name: string | null;
  block_reason: string;
  block_details: string | null;
  caller: string;
  override_used: number;
  created_at: string;
}

// ===== Inbound Call Types =====

export interface InboundCallNotification {
  callId: string;
  phone: string;
  leadName: string | null;
  leadId: string | null;
  timestamp: string;
}

// ===== Cadence Constants =====

export const CADENCE_DAY_SEQUENCE = [1, 2, 4, 6, 9, 12, 16, 20, 24, 28, 32, 36, 39, 42] as const;
export const CADENCE_TOTAL_STAGES = 14;
