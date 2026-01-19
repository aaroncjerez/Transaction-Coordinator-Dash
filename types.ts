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
  key: keyof User;
  direction: 'asc' | 'desc';
}

export interface FilterConfig {
  status?: UserStatus | 'all';
  search: string;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}
