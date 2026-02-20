import React, { useState, useEffect, useCallback } from 'react';
import { Phone, Search, Maximize2, Minimize2, RefreshCw, Loader2 } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { CallQueuePanel } from '../components/dialer/CallQueuePanel';
import { CallHistoryPanel } from '../components/dialer/CallHistoryPanel';
import { InboundCallPanel } from '../components/dialer/InboundCallPanel';
import { DNCPanel } from '../components/dialer/DNCPanel';
import { StatsPanel } from '../components/dialer/StatsPanel';
import { UploadPanel } from '../components/dialer/UploadPanel';
import { CadenceVisualization } from '../components/dialer/CadenceVisualization';
import { LaunchCadenceButton } from '../components/dialer/LaunchCadenceButton';
import { DialerLeadModal } from '../components/dialer/DialerLeadModal';
import { cn } from '../lib/utils';
import {
  fetchDialerTodayCallCount,
  fetchLocalDialerCallQueue,
  fetchLocalDialerDNCList,
  fetchLocalDialerInboundCalls,
  onDialerNewCalls,
  onDialerReviewProgress,
  onDialerInboundCall,
  onDialerCacheUpdated,
  forceDialerSync,
} from '../lib/database';
import { useToast } from '../components/ui/Toast';

type Tab = 'queue' | 'inbound' | 'history' | 'dnc' | 'stats' | 'upload' | 'cadence';

export const AIDialer: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('queue');
  const [searchQuery, setSearchQuery] = useState('');
  const [todayCalls, setTodayCalls] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [dncCount, setDNCCount] = useState(0);
  const [inboundCount, setInboundCount] = useState(0);
  const [selectedLeadPhone, setSelectedLeadPhone] = useState<string | null>(null);
  const [reviewProgress, setReviewProgress] = useState<{ current: number; total: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadCounts = useCallback(async () => {
    try {
      const [calls, queue, dnc, inbound] = await Promise.all([
        fetchDialerTodayCallCount(),
        fetchLocalDialerCallQueue(1000),
        fetchLocalDialerDNCList(),
        fetchLocalDialerInboundCalls(100),
      ]);
      setTodayCalls(calls);
      setQueueCount(Array.isArray(queue) ? queue.length : 0);
      setDNCCount(Array.isArray(dnc) ? dnc.length : 0);
      setInboundCount(Array.isArray(inbound) ? inbound.length : 0);
    } catch (err) {
      console.error('Error loading dialer counts:', err);
    }
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  useEffect(() => {
    onDialerNewCalls(() => { loadCounts(); });
    onDialerReviewProgress((data) => setReviewProgress(data));
    onDialerInboundCall((data) => {
      showToast({
        message: `Inbound call from ${data.leadName || data.phone}`,
        type: 'info',
      });
      loadCounts();
    });
    onDialerCacheUpdated(() => { loadCounts(); });
  }, [loadCounts, showToast]);

  const handleLeadClick = (leadOrPhone: any) => {
    const phone = typeof leadOrPhone === 'string'
      ? leadOrPhone
      : leadOrPhone?.phone_normalized;
    if (phone) setSelectedLeadPhone(phone);
  };

  const handleForceSync = async () => {
    setSyncing(true);
    try {
      await forceDialerSync();
      await loadCounts();
      showToast({ message: 'Dialer data synced', type: 'success' });
    } catch (err) {
      showToast({ message: 'Sync failed', type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'queue', label: 'Call Queue', count: queueCount },
    { key: 'inbound', label: 'Inbound', count: inboundCount },
    { key: 'history', label: 'History', count: todayCalls },
    { key: 'dnc', label: 'DNC List', count: dncCount },
    { key: 'stats', label: 'Stats' },
    { key: 'upload', label: 'Upload' },
    { key: 'cadence', label: 'Cadence' },
  ];

  const content = (
    <>
      {/* AI Review progress */}
      {reviewProgress && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-caption font-medium text-blue-800">
              Reviewing call transcripts...
            </span>
            <span className="text-micro text-blue-600 tabular-nums">
              {reviewProgress.current}/{reviewProgress.total}
            </span>
          </div>
          <div className="bg-blue-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-500 h-full rounded-full transition-all"
              style={{ width: `${(reviewProgress.current / reviewProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Tabs + search */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={cn(
                'px-3 py-1.5 text-caption font-medium rounded-md transition-colors whitespace-nowrap',
                activeTab === tab.key
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              )}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
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
          <button
            onClick={handleForceSync}
            disabled={syncing}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            title="Force sync"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-caption border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-56 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Tab panels */}
      {activeTab === 'queue' && (
        <CallQueuePanel searchQuery={searchQuery} onLeadClick={handleLeadClick} />
      )}
      {activeTab === 'inbound' && (
        <InboundCallPanel searchQuery={searchQuery} onLeadClick={handleLeadClick} />
      )}
      {activeTab === 'history' && (
        <CallHistoryPanel searchQuery={searchQuery} onLeadClick={handleLeadClick} />
      )}
      {activeTab === 'dnc' && (
        <DNCPanel searchQuery={searchQuery} />
      )}
      {activeTab === 'stats' && (
        <StatsPanel />
      )}
      {activeTab === 'upload' && (
        <UploadPanel />
      )}
      {activeTab === 'cadence' && (
        <CadenceVisualization />
      )}
    </>
  );

  // Expanded full-screen overlay
  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Phone size={18} className="text-blue-600" />
            <h1 className="text-base font-semibold text-gray-900">AI Dialer</h1>
            <span className="text-caption text-gray-500">{todayCalls} calls today</span>
          </div>
          <div className="flex items-center gap-2">
            <LaunchCadenceButton />
            <button
              onClick={() => setExpanded(false)}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            >
              <Minimize2 size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5">
          <div className="max-w-7xl mx-auto space-y-5">
            {content}
          </div>
        </div>

        {selectedLeadPhone && (
          <DialerLeadModal
            phoneNormalized={selectedLeadPhone}
            onClose={() => setSelectedLeadPhone(null)}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <TopBar
        title="AI Dialer"
        subtitle={`${todayCalls} calls today`}
        actions={<LaunchCadenceButton />}
      />

      <div className="flex-1 overflow-auto p-5">
        <div className="max-w-6xl mx-auto space-y-5">
          {content}
        </div>
      </div>

      {selectedLeadPhone && (
        <DialerLeadModal
          phoneNormalized={selectedLeadPhone}
          onClose={() => setSelectedLeadPhone(null)}
        />
      )}
    </>
  );
};
