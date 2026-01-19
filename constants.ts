import { User, Metric, ChartDataPoint } from './types';

export const MOCK_USERS: User[] = [
  { id: '1', name: 'Alice Freeman', email: 'alice@nexus.com', role: 'admin', status: 'active', lastActive: '2023-10-26T10:00:00Z', projects: 12 },
  { id: '2', name: 'Bob Smith', email: 'bob@nexus.com', role: 'editor', status: 'active', lastActive: '2023-10-25T14:30:00Z', projects: 5 },
  { id: '3', name: 'Charlie Davis', email: 'charlie@external.com', role: 'viewer', status: 'inactive', lastActive: '2023-09-12T09:15:00Z', projects: 0 },
  { id: '4', name: 'Diana Prince', email: 'diana@nexus.com', role: 'admin', status: 'active', lastActive: '2023-10-26T11:45:00Z', projects: 8 },
  { id: '5', name: 'Evan Wright', email: 'evan@nexus.com', role: 'editor', status: 'pending', lastActive: '2023-10-20T16:20:00Z', projects: 2 },
  { id: '6', name: 'Fiona Gallagher', email: 'fiona@gmail.com', role: 'viewer', status: 'active', lastActive: '2023-10-26T08:00:00Z', projects: 1 },
  { id: '7', name: 'George Miller', email: 'george@nexus.com', role: 'editor', status: 'inactive', lastActive: '2023-08-30T10:00:00Z', projects: 3 },
  { id: '8', name: 'Hannah Scott', email: 'hannah@nexus.com', role: 'viewer', status: 'active', lastActive: '2023-10-25T13:00:00Z', projects: 4 },
  { id: '9', name: 'Ian Malcolm', email: 'ian@chaos.com', role: 'admin', status: 'active', lastActive: '2023-10-26T12:00:00Z', projects: 15 },
  { id: '10', name: 'Julia Roberts', email: 'julia@nexus.com', role: 'viewer', status: 'pending', lastActive: '2023-10-24T09:30:00Z', projects: 0 },
];

export const MOCK_METRICS: Metric[] = [
  { label: 'Total Revenue', value: '$45,231.89', trend: 20.1, trendDirection: 'up' },
  { label: 'Active Users', value: '2,350', trend: 15.2, trendDirection: 'up' },
  { label: 'Bounce Rate', value: '42.3%', trend: -4.5, trendDirection: 'down' }, // Down is good for bounce rate usually, but visually we might treat it differently. Here assume green.
  { label: 'Avg. Session', value: '4m 32s', trend: 1.2, trendDirection: 'neutral' },
];

export const CHART_DATA: ChartDataPoint[] = [
  { date: 'Mon', revenue: 4000, visitors: 2400, activeUsers: 1800 },
  { date: 'Tue', revenue: 3000, visitors: 1398, activeUsers: 1200 },
  { date: 'Wed', revenue: 2000, visitors: 9800, activeUsers: 6500 },
  { date: 'Thu', revenue: 2780, visitors: 3908, activeUsers: 2800 },
  { date: 'Fri', revenue: 1890, visitors: 4800, activeUsers: 3400 },
  { date: 'Sat', revenue: 2390, visitors: 3800, activeUsers: 2900 },
  { date: 'Sun', revenue: 3490, visitors: 4300, activeUsers: 3100 },
];
