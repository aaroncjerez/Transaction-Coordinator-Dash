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
  trend: number; // percentage
  trendDirection: 'up' | 'down' | 'neutral';
}

export interface ChartDataPoint {
  date: string;
  revenue: number;
  visitors: number;
  activeUsers: number;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface FilterConfig {
  status?: string | 'all';
  search: string;
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

export interface Task {
  id: string;
  task_name: string;
  status: 'To Do' | 'In Progress' | 'Done' | 'Canceled';
  notes?: string;
  assigned_to?: any;
  created_at?: string;
  deal_id?: string;
  airtable_id?: string;
}

export interface Deal {
  id: string; // Supabase UUID
  airtable_id: string; // Airtable Record ID
  created_at?: string;
  deal_name: string; // "Last Name - County, State"
  last_name?: string;
  deal_type: string;
  stage: string;
  county: string;
  state: string;
  notes?: string;
  purchase_price: number;
  expected_sales_price: number;
  contract_execution_date?: string;
  expected_close_date?: string;
  close_date?: string;
  phone_number?: string;
  assigned_to?: any;
  days_to_close?: string;
  purchase_agreement_files?: any[];
  funding_agreement_files?: any[];
  deed_files?: any[];
  plat_files?: any[];
  soil_test_files?: any[];
  hud_files?: any[];
  sale_contract_files?: any[];
  due_diligence_link?: string;
}
