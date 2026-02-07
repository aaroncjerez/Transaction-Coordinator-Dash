import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive as ArchiveIcon, Search, DollarSign, Calendar } from 'lucide-react';
import { Deal } from '../types';
import { fetchAllDeals } from '../lib/database';

export const Archive: React.FC = () => {
  const navigate = useNavigate();
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
    if (!price) return '—';
    return `$${price.toLocaleString()}`;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
            <ArchiveIcon className="h-5 w-5 text-gray-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Archive</h1>
            <p className="text-sm text-gray-500">{deals.length} cancelled deal{deals.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search cancelled deals..."
          className="w-full sm:w-80 pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        />
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <ArchiveIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">{search ? 'No matching deals' : 'No cancelled deals'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(deal => (
            <button
              key={deal.id}
              onClick={() => navigate(`/deals/${deal.id}`)}
              className="w-full text-left bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600">
                    {deal.deal_name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{deal.deal_type}</span>
                    {deal.county && (
                      <span className="text-xs text-gray-400">{deal.county}, {deal.state}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500 flex-shrink-0 ml-4">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {formatPrice(deal.purchase_price)}
                  </span>
                  {deal.updated_at && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
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
  );
};
