import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive as ArchiveIcon, Search, DollarSign, Calendar, RotateCcw, ArrowUpDown, CheckSquare, FileText } from 'lucide-react';
import { Deal, Task, FileRecord } from '../types';
import { fetchAllDeals, fetchAllTasks, updateDealFields } from '../lib/database';
import { TopBar } from '../components/TopBar';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonRow } from '../components/ui/Skeleton';
import { useOpenCommandPalette } from '../components/Layout';
import { useToast } from '../components/ui/Toast';
import { cn } from '../lib/utils';

type SortKey = 'name' | 'date' | 'price';

export const Archive: React.FC = () => {
  const navigate = useNavigate();
  const openCommandPalette = useOpenCommandPalette();
  const { showToast } = useToast();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [allDeals, allTasks] = await Promise.all([fetchAllDeals(), fetchAllTasks()]);
      setDeals((allDeals as Deal[]).filter(d => d.stage === 'Cancelled'));
      setTasks(allTasks as Task[]);
    } catch (err) {
      console.error('Archive: fetch error', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Task counts by deal
  const taskCountByDeal = useMemo(() => {
    const map: Record<string, number> = {};
    tasks.forEach(t => { map[t.deal_id] = (map[t.deal_id] || 0) + 1; });
    return map;
  }, [tasks]);

  const filtered = useMemo(() => {
    let result = deals;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        d.deal_name.toLowerCase().includes(q) ||
        d.county?.toLowerCase().includes(q) ||
        d.state?.toLowerCase().includes(q)
      );
    }
    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === 'name') return a.deal_name.localeCompare(b.deal_name);
      if (sortBy === 'price') return (b.purchase_price || 0) - (a.purchase_price || 0);
      // date (default): most recently updated first
      return (b.updated_at || '').localeCompare(a.updated_at || '');
    });
    return result;
  }, [deals, search, sortBy]);

  const handleRestore = async (deal: Deal) => {
    setRestoringId(deal.id);
    try {
      const restoreStage = deal.previous_stage || 'Purchase Agreement Signed';
      await updateDealFields(deal.id, { stage: restoreStage });
      await loadData();
      showToast({ message: `${deal.deal_name} restored to ${restoreStage}`, type: 'success' });
    } catch (err) {
      console.error('Restore failed:', err);
      showToast({ message: `Failed to restore ${deal.deal_name}`, type: 'error' });
    } finally {
      setRestoringId(null);
    }
  };

  const formatPrice = (price: number) => {
    if (!price) return '\u2014';
    return `$${price.toLocaleString()}`;
  };

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'date', label: 'Recent' },
    { key: 'name', label: 'Name' },
    { key: 'price', label: 'Price' },
  ];

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title="Archive"
        subtitle={`${deals.length} cancelled deal${deals.length !== 1 ? 's' : ''}`}
        onSearchClick={openCommandPalette}
      />

      {/* Filter + Sort Bar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-4">
        <div className="relative max-w-sm flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search cancelled deals..."
            className="w-full pl-9 pr-3 py-1.5 text-caption bg-subtle border border-gray-200 rounded-md focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowUpDown size={12} className="text-gray-400" />
          {sortOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              className={cn(
                'text-caption px-2 py-1 rounded-md font-medium transition-colors',
                sortBy === opt.key
                  ? 'bg-primary text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-5 py-5">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<ArchiveIcon size={24} />}
              title={search ? 'No matching deals' : 'No cancelled deals'}
              description={search ? `Nothing matches "${search}"` : 'Cancelled deals will appear here when you move deals to the Cancelled stage.'}
              className="py-16"
            />
          ) : (
            <div className="space-y-2">
              {filtered.map(deal => (
                <div
                  key={deal.id}
                  className={cn(
                    'bg-white rounded-card border border-gray-200 p-3.5 shadow-xs',
                    'hover:shadow-sm hover:border-gray-300 transition-all group'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Left: deal info (clickable) */}
                    <button
                      onClick={() => navigate(`/deals/${deal.id}`)}
                      className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded"
                    >
                      <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-primary transition-colors">
                        {deal.deal_name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-micro font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{deal.deal_type}</span>
                        {deal.county && (
                          <span className="text-micro text-gray-400">{deal.county}, {deal.state}</span>
                        )}
                        {taskCountByDeal[deal.id] > 0 && (
                          <span className="text-micro text-gray-400 flex items-center gap-0.5">
                            <CheckSquare size={10} /> {taskCountByDeal[deal.id]}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Right: metadata + restore */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="flex items-center gap-3 text-micro text-gray-500">
                        <span className="flex items-center gap-1">
                          <DollarSign size={11} />
                          {formatPrice(deal.purchase_price)}
                        </span>
                        {deal.updated_at && (
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            {new Date(deal.updated_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleRestore(deal)}
                        disabled={restoringId === deal.id}
                        className={cn(
                          'flex items-center gap-1 text-caption font-medium px-2.5 py-1.5 rounded-md transition-colors',
                          'text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20',
                          restoringId === deal.id && 'opacity-50 cursor-not-allowed'
                        )}
                        title="Restore to Pipeline"
                      >
                        <RotateCcw size={12} className={cn(restoringId === deal.id && 'animate-spin')} />
                        Restore
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
