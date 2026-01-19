import React, { useState, useEffect } from 'react';
import { Plus, ArrowUpRight, ArrowDownRight, RefreshCw, Bell } from 'lucide-react';
import { MOCK_USERS, MOCK_METRICS, CHART_DATA } from '../constants';
import { User, Metric } from '../types';
import { DataTable } from './DataTable';
import { RevenueChart, ActivityChart } from './Charts';
import { Button } from './ui/Button';
import { CreateUserModal } from './CreateUserModal';
import { cn } from '../lib/utils';

export const Dashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>(MOCK_METRICS);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null);

  // Initial Data Fetch Simulation
  useEffect(() => {
    const fetchData = async () => {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 800));
      setUsers(MOCK_USERS);
      setIsLoading(false);
    };
    fetchData();
  }, []);

  // Refresh Handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsRefreshing(false);
    // In a real app, we'd refetch here
  };

  // Create User Handler (Optimistic Update)
  const handleCreateUser = async (newUser: any) => {
    // 1. Optimistic Update
    const tempId = Math.random().toString(36).substr(2, 9);
    const userToAdd: User = {
        ...newUser,
        id: tempId,
        projects: 0,
        lastActive: new Date().toISOString()
    };
    
    const prevUsers = [...users];
    setUsers([userToAdd, ...users]);

    // 2. Api Call Simulation
    try {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate server delay
        setToast({ message: "Team member added successfully", type: 'success' });
        setTimeout(() => setToast(null), 3000);
    } catch (error) {
        // Rollback on error
        setUsers(prevUsers);
        setToast({ message: "Failed to create user", type: 'error' });
        throw error;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50 h-full scrollbar-hide">
        {/* Toast Notification */}
        {toast && (
            <div className={cn(
                "fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium z-50 animate-in slide-in-from-bottom-5 duration-300",
                toast.type === 'success' ? "bg-white border-emerald-100 text-emerald-700" : "bg-white border-red-100 text-red-700"
            )}>
               <div className="flex items-center gap-2">
                 <div className={cn("w-2 h-2 rounded-full", toast.type === 'success' ? "bg-emerald-500" : "bg-red-500")} />
                 {toast.message}
               </div>
            </div>
        )}

      {/* Top Bar (Contextual) */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-sm text-gray-500 hidden sm:block">Welcome back, John. Here's what's happening today.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing} className={isRefreshing ? "animate-spin" : ""}>
             <RefreshCw className="h-4 w-4" />
          </Button>
           <Button variant="outline" size="icon" className="relative">
             <Bell className="h-4 w-4" />
             <span className="absolute top-2 right-2.5 h-1.5 w-1.5 bg-red-500 rounded-full border border-white"></span>
          </Button>
          <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block"></div>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Member
          </Button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        
        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric, idx) => (
            <div key={idx} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-sm font-medium text-gray-500">{metric.label}</p>
              <div className="mt-2 flex items-baseline justify-between">
                <h3 className="text-2xl font-bold text-gray-900 tracking-tight">{metric.value}</h3>
                <span className={cn(
                  "flex items-center text-xs font-semibold px-2 py-1 rounded-full",
                  metric.trendDirection === 'up' ? "bg-emerald-50 text-emerald-700" : 
                  metric.trendDirection === 'down' ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-700"
                )}>
                  {metric.trendDirection === 'up' ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                  {Math.abs(metric.trend)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
             <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-base font-semibold text-gray-900">Revenue Trends</h3>
                    <p className="text-xs text-gray-500">Gross income over last 7 days</p>
                </div>
                {/* Chart Filter/Actions placeholder */}
                <select className="text-xs border-gray-200 rounded-md text-gray-500 bg-gray-50">
                    <option>Last 7 days</option>
                    <option>Last 30 days</option>
                </select>
             </div>
             <RevenueChart data={CHART_DATA} />
          </div>
           <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
             <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-base font-semibold text-gray-900">User Activity</h3>
                    <p className="text-xs text-gray-500">Visitors vs Active Users</p>
                </div>
             </div>
             <ActivityChart data={CHART_DATA} />
          </div>
        </div>

        {/* Data Table Section */}
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                 <h3 className="text-lg font-bold text-gray-900">Team Members</h3>
            </div>
            <DataTable 
                data={users} 
                isLoading={isLoading} 
                onRefresh={handleRefresh}
            />
        </div>
      </main>
      
      <CreateUserModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateUser}
      />
    </div>
  );
};
