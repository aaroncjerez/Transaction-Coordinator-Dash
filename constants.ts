import { User, Metric, ChartDataPoint, Customer, Project } from './types';

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
  { label: 'Bounce Rate', value: '42.3%', trend: -4.5, trendDirection: 'down' },
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

export const MOCK_CUSTOMERS: Customer[] = [
  { id: 'c1', name: 'Acme Corp', company: 'Acme Inc.', email: 'contact@acme.com', status: 'active', spent: '$12,450', lastOrder: '2023-10-20' },
  { id: 'c2', name: 'Stark Ind', company: 'Stark Industries', email: 'tony@stark.com', status: 'active', spent: '$850,000', lastOrder: '2023-10-26' },
  { id: 'c3', name: 'Wayne Ent', company: 'Wayne Enterprises', email: 'bruce@wayne.com', status: 'churned', spent: '$45,000', lastOrder: '2023-08-15' },
  { id: 'c4', name: 'Cyberdyne', company: 'Cyberdyne Systems', email: 'sales@cyberdyne.com', status: 'lead', spent: '$0', lastOrder: 'N/A' },
  { id: 'c5', name: 'Massive Dynamic', company: 'Massive Dynamic', email: 'info@massive.com', status: 'active', spent: '$120,500', lastOrder: '2023-10-22' },
  { id: 'c6', name: 'Hooli', company: 'Hooli', email: 'gavin@hooli.com', status: 'active', spent: '$34,200', lastOrder: '2023-10-25' },
];

export const MOCK_PROJECTS: Project[] = [
  { id: 'p1', name: 'Website Redesign', description: 'Overhaul of main marketing site with new branding.', status: 'in_progress', dueDate: '2023-12-01', budget: '$15,000', completion: 65, members: 4 },
  { id: 'p2', name: 'Mobile App Launch', description: 'iOS and Android release for Q4.', status: 'planning', dueDate: '2024-02-15', budget: '$45,000', completion: 10, members: 8 },
  { id: 'p3', name: 'Database Migration', description: 'Moving legacy data to new cloud infrastructure.', status: 'completed', dueDate: '2023-10-15', budget: '$8,000', completion: 100, members: 2 },
  { id: 'p4', name: 'AI Integration', description: 'Implementing LLM features for customer support bot.', status: 'paused', dueDate: '2024-01-20', budget: '$25,000', completion: 30, members: 3 },
  { id: 'p5', name: 'Q4 Marketing Campaign', description: 'Holiday season ad spend and creative assets.', status: 'in_progress', dueDate: '2023-11-20', budget: '$60,000', completion: 45, members: 5 },
];

export const DEAL_STAGES = [
  'Offer Accepted',
  'Due Diligence',
  'Sent to Escrow',
  'Purchase Escrow',
  'Purchased Escrow',
  'Purchased',
  'Listed',
  'Sale Escrow',
  'Sold',
  'Cancelled'
];
