import React, { useState, useEffect } from 'react';
import { Plus, ArrowUpRight, ArrowDownRight, RefreshCw, Bell } from 'lucide-react';
import { MOCK_USERS, MOCK_METRICS } from '../constants';
import { User, Metric, Deal } from '../types';
import { DataTable } from '../components/DataTable';
import { Button } from '../components/ui/Button';

import { CreateDealModal } from '../components/CreateDealModal';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { DealOverviewCard } from '../components/DealOverviewCard';
import { syncAirtableToSupabase, updateAirtableRecord } from '../lib/sync';

export const Dashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>(MOCK_METRICS);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [viewMode, setViewMode] = useState<'All' | 'Live'>('Live');

  // Initial Data Fetch
  const fetchData = async () => {
    try {
      setIsLoading(true);

      const { data: fetchedDeals, error } = await supabase
        .from('deal_vault')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDeals((fetchedDeals || []) as Deal[]);

      const activeDeals = fetchedDeals?.filter(d => !['Closed', 'Dead', 'Cancelled'].includes(d.stage)) || [];

      const newMetrics: Metric[] = [
        { label: 'Active Deals', value: activeDeals.length.toString(), trend: 0, trendDirection: 'neutral' },
      ];

      setMetrics(newMetrics);
      setUsers(MOCK_USERS);

    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []); // Only run once on mount

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Sync Logic: Pull from Airtable first, then check Supabase (Sync returns fresh data)
      const syncedDeals = await syncAirtableToSupabase();

      // If sync returns empty (unconfigured), we might fallback or just toast.
      // Assuming syncDealsFromAirtable handles the "check Supabase" part by upserting and returning fresh data.
      if (syncedDeals.length > 0) {
        setDeals(syncedDeals);
        setToast({ message: "Synced with Airtable", type: 'success' });
      } else {
        // Fallback fetch if sync failed/empty (or if keys missing)
        const { data } = await supabase.from('deal_vault').select('*').order('created_at', { ascending: false });
        setDeals((data || []) as Deal[]);
        setToast({ message: "Refreshed (Airtable Sync unavailable)", type: 'success' }); // Warning?
      }
    } catch (e) {
      console.error("Sync failed:", e);
      setToast({ message: "Sync failed", type: 'error' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStageUpdate = async (dealId: string, newStage: string) => {
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;

    // Optimistic Update
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: newStage } : d));

    try {
      // 1. Update Airtable (if linked)
      if (deal.airtable_id && !deal.airtable_id.startsWith('temp-')) {
        await updateAirtableRecord(deal.airtable_id, { "Stage": newStage });
      }

      // 2. Shadow Write (Upsert) to Supabase
      const { error } = await supabase
        .from('deal_vault')
        .upsert({ ...deal, stage: newStage }) // Upsert entire object or just fields? upsert needs PK.
        .eq('id', dealId); // Upsert doesn't need .eq, it needs payload with PK.

      if (error) throw error;
      setToast({ message: "Stage updated & synced", type: 'success' });

    } catch (error) {
      console.error("Error updating stage:", error);
      setToast({ message: "Failed to update stage", type: 'error' });
      // Revert optimistic update?
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: deal.stage } : d));
    }
  };

  const filteredDeals = viewMode === 'All'
    ? deals
    : deals.filter(d => !['Closed', 'Dead', 'Cancelled', 'Sold'].includes(d.stage));

  const activeDealsCount = deals.filter(d => !['Closed', 'Dead', 'Cancelled', 'Sold'].includes(d.stage)).length;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50 h-full scrollbar-hide">
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

      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Deal Command Center</h1>
          <p className="text-sm text-gray-500">Manage {activeDealsCount} Active Deals</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Deal
          </Button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.map((metric, idx) => (
            <div key={idx} className="bg-white px-4 py-3 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">{metric.label}</p>
                <p className="text-lg font-bold text-gray-900">{metric.value}</p>
              </div>
              <span className={cn("text-xs flex items-center", metric.trendDirection === 'up' ? "text-emerald-600" : "text-gray-400")}>
                {metric.trendDirection === 'up' ? <ArrowUpRight size={12} /> : null}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setViewMode('All')}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
              viewMode === 'All'
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            )}
          >
            All Deals ({deals.length})
          </button>
          <button
            onClick={() => setViewMode('Live')}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
              viewMode === 'Live'
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            )}
          >
            Live Deals ({activeDealsCount})
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDeals.map(deal => (
              <DealOverviewCard
                key={deal.id}
                deal={deal}
                onStageUpdate={handleStageUpdate}
              />
            ))}
          </div>
        )}
      </main>

      <CreateDealModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          setToast({ message: "Deal Created in Supabase (Sync pending)", type: 'success' });
          fetchData();
        }}
      />
    </div>
  );
};

