import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive as ArchiveIcon, Search, DollarSign, Calendar } from 'lucide-react';
import { Deal } from '../types';
import { fetchAllDeals } from '../lib/database';
import { TopBar } from '../components/TopBar';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonRow } from '../components/ui/Skeleton';
import { useOpenCommandPalette } from '../components/Layout';
import { cn } from '../lib/utils';

export const Archive: React.FC = () => {
  const navigate = useNavigate();
  const openCommandPalette = useOpenCommandPalette();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const all = await fetchAllDeals();
        setDeals((all as Deal[]).filter(d => d.stage === 'Cancelled'));
      } catch (err) {
        console.error('Archive: fetch error', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return deals;
    const q = search.toLowerCase();
    return deals.filter(d => d.deal_name.toLowerCase().includes(q));
  }, [deals, search]);

  const formatPrice = (price: number) => {
    if (!price) return '\u2014';
    return `$${price.toLocaleString()}`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* TopBar */}
      <TopBar
        title="Archive"
        subtitle={`${deals.length} cancelled deal${deals.length !== 1 ? 's' : ''}`}
        onSearchClick={openCommandPalette}
      />

      {/* Filter Bar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search cancelled deals..."
            className="w-full pl-9 pr-3 py-1.5 text-caption bg-subtle border border-gray-200 rounded-md focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-5 py-5">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<ArchiveIcon size={24} />}
              title={search ? 'No matching deals' : 'No cancelled deals'}
              description={search ? `Nothing matches "${search}"` : 'Cancelled deals will appear here'}
              className="py-16"
            />
          ) : (
            <div className="space-y-2">
              {filtered.map(deal => (
                <button
                  key={deal.id}
                  onClick={() => navigate(`/deals/${deal.id}`)}
                  className={cn(
                    'w-full text-left bg-white rounded-card border border-gray-200 p-3.5 shadow-xs',
                    'hover:shadow-sm hover:border-gray-300 transition-all group',
                    'focus-visible:outline-none focus-visible:shadow-focus'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-primary transition-colors">
                        {deal.deal_name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-micro font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{deal.deal_type}</span>
                        {deal.county && (
                          <span className="text-micro text-gray-400">{deal.county}, {deal.state}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-micro text-gray-500 flex-shrink-0 ml-4">
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
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
