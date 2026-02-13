import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Flame, RefreshCw, Search, Loader2, ArrowUpDown } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { LeadCard } from '../components/leads/LeadCard';
import { LeadModal } from '../components/leads/LeadModal';
import { cn } from '../lib/utils';
import {
  fetchDailyLeads,
  fetchAndAnalyzeLeads,
  markLeadContacted,
  unmarkLeadContacted,
  getLeadStats,
  onLeadAnalysisProgress,
} from '../lib/database';
import type { DailyLead } from '../types';

// ── Priority scoring (ported from LeadDashboard.jsx) ──

function computeDailyPriority(lead: DailyLead): number {
  const now = Date.now();

  // Freshness (0-30)
  let freshnessScore = 0;
  if (lead.created_at) {
    const hoursOld = (now - new Date(lead.created_at).getTime()) / (1000 * 60 * 60);
    if (hoursOld <= 24) freshnessScore = 30;
    else if (hoursOld <= 48) freshnessScore = 20;
    else if (hoursOld <= 72) freshnessScore = 10;
  }

  // Discount likelihood (0-30)
  const discountScore = ((lead.discount_likelihood || 0) / 10) * 30;

  // Timeline urgency (0-20)
  const timeline = lead.negotiation_strategy?.timeline;
  const timelineMap: Record<string, number> = { immediate: 20, '1-2_weeks': 14, '1_month': 8, flexible: 4 };
  const timelineScore = (timeline && timelineMap[timeline]) ?? 10;

  // Staleness (0-20)
  let stalenessScore = 20;
  if (lead.last_communication) {
    const daysSince = (now - new Date(lead.last_communication).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 1) stalenessScore = 0;
    else if (daysSince < 3) stalenessScore = 4;
    else if (daysSince < 7) stalenessScore = 10;
    else if (daysSince < 14) stalenessScore = 14;
    else stalenessScore = 18;
  }

  return Math.round(freshnessScore + discountScore + timelineScore + stalenessScore);
}

function isContactedToday(lead: DailyLead): boolean {
  if (!lead.contacted_today) return false;
  const today = new Date().toISOString().split('T')[0];
  return lead.contacted_today === today;
}

type Tab = 'today' | 'all' | 'done';
type SortOption = 'priority' | 'score' | 'newest' | 'oldest' | 'least_contacted' | 'most_contacted';

const SORT_LABELS: Record<SortOption, string> = {
  priority: 'Priority',
  score: 'AI Score',
  newest: 'Newest in FUB',
  oldest: 'Oldest in FUB',
  least_contacted: 'Least Recently Contacted',
  most_contacted: 'Most Recently Contacted',
};

function getContactDate(lead: DailyLead): number {
  // Use contacted_today first, then last_communication, then 0 (never contacted)
  if (lead.contacted_today) return new Date(lead.contacted_today).getTime();
  if (lead.last_communication) return new Date(lead.last_communication).getTime();
  return 0;
}

function sortLeads(leads: DailyLead[], sortBy: SortOption): DailyLead[] {
  return [...leads].sort((a, b) => {
    switch (sortBy) {
      case 'priority':
        return (b._priorityScore || 0) - (a._priorityScore || 0);
      case 'score':
        return (b.score || 0) - (a.score || 0);
      case 'newest':
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      case 'oldest':
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      case 'least_contacted':
        return getContactDate(a) - getContactDate(b); // 0 (never) sorts first
      case 'most_contacted':
        return getContactDate(b) - getContactDate(a);
      default:
        return 0;
    }
  });
}

export const Leads: React.FC = () => {
  const [leads, setLeads] = useState<DailyLead[]>([]);
  const [stats, setStats] = useState({ total: 0, newLeads48h: 0, doneToday: 0, highDiscount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('priority');
  const [selectedLead, setSelectedLead] = useState<DailyLead | null>(null);
  const [addedToToday, setAddedToToday] = useState<Set<number>>(new Set());

  // ── Data loading ──

  const loadData = useCallback(async () => {
    try {
      const [leadsData, statsData] = await Promise.all([
        fetchDailyLeads(),
        getLeadStats(),
      ]);
      setLeads(leadsData);
      setStats(statsData);
    } catch (err) {
      console.error('Error loading leads:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    onLeadAnalysisProgress((data) => setProgress(data));
  }, []);

  // ── Leads with priority scores ──

  const leadsWithPriority = useMemo(() => {
    return leads.map(lead => ({
      ...lead,
      _priorityScore: computeDailyPriority(lead),
    }));
  }, [leads]);

  // ── Tab filtering ──

  const todaysActions = useMemo(() => {
    return leadsWithPriority
      .filter(l => !l.is_completed && !isContactedToday(l) &&
        ((l.discount_likelihood || 0) >= 3 || addedToToday.has(l.id)))
      .sort((a, b) => (b._priorityScore || 0) - (a._priorityScore || 0));
  }, [leadsWithPriority, addedToToday]);

  const doneTodayLeads = useMemo(() => {
    return leadsWithPriority.filter(l => isContactedToday(l));
  }, [leadsWithPriority]);

  const todayIds = useMemo(() => new Set(todaysActions.map(l => l.id)), [todaysActions]);

  // ── Search + display ──

  const displayLeads = useMemo(() => {
    let filtered: DailyLead[];
    if (activeTab === 'today') filtered = todaysActions;
    else if (activeTab === 'done') filtered = doneTodayLeads;
    else filtered = leadsWithPriority;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.stage?.toLowerCase().includes(q) ||
        l.phone?.includes(q) ||
        l.summary?.toLowerCase().includes(q)
      );
    }

    return sortLeads(filtered, sortBy);
  }, [activeTab, todaysActions, doneTodayLeads, leadsWithPriority, searchQuery, sortBy]);

  // ── Actions ──

  const handleGenerate = async () => {
    setAnalyzing(true);
    setProgress(null);
    try {
      await fetchAndAnalyzeLeads();
      await loadData();
    } catch (err) {
      console.error('Error generating report:', err);
    } finally {
      setAnalyzing(false);
      setProgress(null);
    }
  };

  const handleMarkContacted = useCallback(async (id: number) => {
    await markLeadContacted(id);
    setLeads(prev => prev.map(l => l.id === id ? { ...l, contacted_today: new Date().toISOString().split('T')[0] } : l));
    setStats(prev => ({ ...prev, doneToday: prev.doneToday + 1 }));
  }, []);

  const handleUnmarkContacted = useCallback(async (id: number) => {
    await unmarkLeadContacted(id);
    setLeads(prev => prev.map(l => l.id === id ? { ...l, contacted_today: undefined } : l));
    setStats(prev => ({ ...prev, doneToday: Math.max(0, prev.doneToday - 1) }));
  }, []);

  const handleAddToToday = useCallback((id: number) => {
    setAddedToToday(prev => new Set(prev).add(id));
  }, []);

  const handleLeadUpdate = useCallback((updated: DailyLead) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
    setSelectedLead(updated);
  }, []);

  // ── Render ──

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'today', label: "Today's Actions", count: todaysActions.length },
    { key: 'all', label: 'All Leads', count: leads.length },
    { key: 'done', label: 'Done Today', count: doneTodayLeads.length },
  ];

  return (
    <>
      <TopBar
        title="Leads"
        subtitle={`${leads.length} total leads`}
        actions={
          <button
            className={cn(
              'inline-flex items-center gap-1.5 text-caption font-medium px-3 py-1.5 rounded-md transition-colors',
              analyzing
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-primary text-white hover:bg-blue-700'
            )}
            onClick={handleGenerate}
            disabled={analyzing}
          >
            {analyzing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Flame size={14} />
            )}
            {analyzing ? 'Analyzing...' : 'Generate Report'}
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-5">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Progress bar during analysis */}
          {analyzing && progress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-caption font-medium text-blue-800">
                  Analyzing: {progress.name}
                </span>
                <span className="text-micro text-blue-600 tabular-nums">
                  {progress.current}/{progress.total}
                </span>
              </div>
              <div className="bg-blue-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="New Leads" sublabel="48h" value={stats.newLeads48h} />
            <StatCard label="Today's Queue" value={todaysActions.length} />
            <StatCard label="Done Today" value={stats.doneToday} accent="emerald" />
            <StatCard label="High Discount" sublabel="8+" value={stats.highDiscount} accent="amber" />
          </div>

          {/* Tabs + search */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  className={cn(
                    'px-3 py-1.5 text-caption font-medium rounded-md transition-colors',
                    activeTab === tab.key
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  )}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={cn(
                      'ml-1.5 text-micro px-1.5 py-0.5 rounded-full tabular-nums',
                      activeTab === tab.key
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 text-gray-500'
                    )}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <ArrowUpDown size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="pl-8 pr-8 py-1.5 text-caption border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white appearance-none cursor-pointer transition-colors"
                >
                  {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search leads..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-caption border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-56 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Lead grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : displayLeads.length === 0 ? (
            <div className="text-center py-20">
              <Flame size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">
                {leads.length === 0
                  ? 'No leads yet. Click "Generate Report" to fetch and analyze leads from FUB.'
                  : activeTab === 'today'
                    ? "No leads in today's queue."
                    : activeTab === 'done'
                      ? 'No leads marked done today.'
                      : 'No matching leads.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayLeads.map(lead => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onClick={() => setSelectedLead(lead)}
                  onMarkContacted={handleMarkContacted}
                  onUnmarkContacted={handleUnmarkContacted}
                  onAddToToday={handleAddToToday}
                  isContactedToday={isContactedToday(lead)}
                  isInTodaysActions={todayIds.has(lead.id)}
                  activeTab={activeTab}
                  showPriority={activeTab === 'today'}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lead detail modal */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onLeadUpdate={handleLeadUpdate}
          onMarkContacted={handleMarkContacted}
          onUnmarkContacted={handleUnmarkContacted}
          isContactedToday={isContactedToday(selectedLead)}
        />
      )}
    </>
  );
};

// ── Sub-components ──

const StatCard: React.FC<{
  label: string;
  sublabel?: string;
  value: number;
  accent?: 'emerald' | 'amber';
}> = ({ label, sublabel, value, accent }) => (
  <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
    <p className="text-micro text-gray-500 font-medium">
      {label}
      {sublabel && <span className="text-gray-400 ml-1">({sublabel})</span>}
    </p>
    <p className={cn(
      'text-2xl font-bold mt-0.5',
      accent === 'emerald' ? 'text-emerald-600' : accent === 'amber' ? 'text-amber-600' : 'text-gray-900'
    )}>
      {value}
    </p>
  </div>
);
