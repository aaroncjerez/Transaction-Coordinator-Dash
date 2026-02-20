import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, ShieldOff, ShieldAlert, Plus, Trash2, RefreshCw } from 'lucide-react';
import { fetchLocalDialerDNCList, fetchLocalDialerDNCStats, addDialerManualDNC, removeDialerDNC, syncDialerFubDNC, onDialerFubSyncProgress, onDialerCacheUpdated } from '../../lib/database';
import { formatPhone, normalizePhone } from '../../lib/utils/phone';
import { useToast } from '../ui/Toast';
import { cn } from '../../lib/utils';

interface DNCPanelProps {
  searchQuery: string;
}

export const DNCPanel: React.FC<DNCPanelProps> = ({ searchQuery }) => {
  const [entries, setEntries] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [addingDNC, setAddingDNC] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ stage: string; fetched: number; phones: number } | null>(null);
  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    try {
      const [list, dncStats] = await Promise.all([
        fetchLocalDialerDNCList(),
        fetchLocalDialerDNCStats(),
      ]);
      setEntries(list);
      setStats(dncStats);
    } catch (err) {
      console.error('Error loading DNC data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    onDialerFubSyncProgress((data) => setSyncProgress(data));
    onDialerCacheUpdated((data) => {
      if (data.type === 'dnc') loadData();
    });
  }, [loadData]);

  const handleSyncFub = async () => {
    setSyncing(true);
    setSyncProgress(null);
    try {
      const result = await syncDialerFubDNC();
      showToast({
        message: `Synced ${result.unique_phones} FUB phones → ${result.added} added, ${result.duplicates} already existed`,
        type: 'success',
      });
      await loadData();
    } catch (err: any) {
      showToast({ message: err.message || 'FUB sync failed', type: 'error' });
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter((e: any) =>
      (e.phone_normalized || '').includes(q) ||
      (e.first_name || '').toLowerCase().includes(q) ||
      (e.last_name || '').toLowerCase().includes(q) ||
      (e.reason || '').toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  const handleAddDNC = async () => {
    const normalized = normalizePhone(newPhone);
    if (normalized.length !== 10) {
      showToast({ message: 'Enter a valid 10-digit phone number', type: 'error' });
      return;
    }
    try {
      await addDialerManualDNC(normalized, newReason || 'Manual add from TC Dash');
      setNewPhone('');
      setNewReason('');
      setAddingDNC(false);
      await loadData();
      showToast({ message: 'Added to DNC list', type: 'success' });
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to add DNC', type: 'error' });
    }
  };

  const handleRemoveDNC = async (phone: string) => {
    try {
      await removeDialerDNC(phone);
      await loadData();
      showToast({ message: 'Removed from DNC list', type: 'success' });
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to remove', type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  const sourceColors: Record<string, string> = {
    'Auto-Detected': 'bg-red-50 text-red-700',
    'Follow Up Boss': 'bg-blue-50 text-blue-700',
    'Manually Uploaded': 'bg-gray-100 text-gray-600',
    'Not Interested': 'bg-yellow-50 text-yellow-700',
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Auto-Detected', value: stats.autoDetected, color: 'text-red-600' },
            { label: 'FUB', value: stats.fub, color: 'text-blue-600' },
            { label: 'Manual', value: stats.manual },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-lg border border-gray-200 shadow-xs p-3">
              <p className="text-micro text-gray-500 font-medium">{s.label}</p>
              <p className={cn('text-xl font-bold mt-0.5', s.color || 'text-gray-900')}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add DNC */}
      <div className="flex items-center gap-2">
        {addingDNC ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              placeholder="Phone number"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="px-3 py-1.5 text-caption border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-40"
              autoFocus
            />
            <input
              type="text"
              placeholder="Reason (optional)"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              className="px-3 py-1.5 text-caption border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 flex-1"
            />
            <button
              onClick={handleAddDNC}
              className="px-3 py-1.5 text-caption font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Add
            </button>
            <button
              onClick={() => { setAddingDNC(false); setNewPhone(''); setNewReason(''); }}
              className="px-3 py-1.5 text-caption text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAddingDNC(true)}
              className="inline-flex items-center gap-1.5 text-caption font-medium text-red-600 hover:text-red-700"
            >
              <Plus size={14} /> Add to DNC
            </button>
            <button
              onClick={handleSyncFub}
              disabled={syncing}
              className={cn(
                'inline-flex items-center gap-1.5 text-caption font-medium transition-colors',
                syncing
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-blue-600 hover:text-blue-700'
              )}
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing FUB...' : 'Sync from FUB'}
            </button>
          </div>
        )}
      </div>

      {/* FUB Sync Progress */}
      {syncing && syncProgress && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-caption font-medium text-blue-800">
              Pulling from FUB: {syncProgress.stage}
            </span>
            <span className="text-micro text-blue-600 tabular-nums">
              {syncProgress.fetched} people → {syncProgress.phones} phones
            </span>
          </div>
        </div>
      )}

      {/* DNC Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <ShieldOff size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">No DNC entries found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
          <table className="w-full text-caption">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 text-micro font-medium text-gray-500">Phone</th>
                <th className="text-left px-3 py-2 text-micro font-medium text-gray-500">Name</th>
                <th className="text-left px-3 py-2 text-micro font-medium text-gray-500">Source</th>
                <th className="text-left px-3 py-2 text-micro font-medium text-gray-500">Type</th>
                <th className="text-left px-3 py-2 text-micro font-medium text-gray-500">Reason</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry: any, i: number) => (
                <tr key={entry.id || i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-700">{formatPhone(entry.phone_normalized)}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {[entry.first_name, entry.last_name].filter(Boolean).join(' ') || '\u2014'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      'px-1.5 py-0.5 rounded-full text-micro font-medium',
                      sourceColors[entry.source] || 'bg-gray-100 text-gray-600'
                    )}>
                      {entry.source || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      'text-micro',
                      entry.dnc_type === 'temporary' ? 'text-amber-600' : 'text-red-600'
                    )}>
                      {entry.dnc_type === 'temporary' ? 'Temp (90d)' : 'Permanent'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">{entry.reason || '\u2014'}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleRemoveDNC(entry.phone_normalized)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove from DNC"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
