import React, { useState, useEffect, useCallback } from 'react';
import { Phone, Search, Loader2 } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { CallQueuePanel } from '../components/dialer/CallQueuePanel';
import { CallHistoryPanel } from '../components/dialer/CallHistoryPanel';
import { DNCPanel } from '../components/dialer/DNCPanel';
import { StatsPanel } from '../components/dialer/StatsPanel';
import { UploadPanel } from '../components/dialer/UploadPanel';
import { LaunchCadenceButton } from '../components/dialer/LaunchCadenceButton';
import { DialerLeadModal } from '../components/dialer/DialerLeadModal';
import { cn } from '../lib/utils';
import {
  fetchDialerTodayCallCount,
  fetchDialerCallQueue,
  fetchDialerDNCList,
  fetchDialerCallsForLead,
  onDialerNewCalls,
  onDialerReviewProgress,
} from '../lib/database';

type Tab = 'queue' | 'history' | 'dnc' | 'stats' | 'upload';

export const AIDialer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('queue');
  const [searchQuery, setSearchQuery] = useState('');
  const [todayCalls, setTodayCalls] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [dncCount, setDNCCount] = useState(0);
  const [selectedLeadPhone, setSelectedLeadPhone] = useState<string | null>(null);
  const [reviewProgress, setReviewProgress] = useState<{ current: number; total: number } | null>(null);

  const loadCounts = useCallback(async () => {
    try {
      const [calls, queue, dnc] = await Promise.all([
        fetchDialerTodayCallCount(),
        fetchDialerCallQueue(1000),
        fetchDialerDNCList(),
      ]);
      setTodayCalls(calls);
      setQueueCount(Array.isArray(queue) ? queue.length : 0);
      setDNCCount(Array.isArray(dnc) ? dnc.length : 0);
    } catch (err) {
      console.error('Error loading dialer counts:', err);
    }
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  useEffect(() => {
    onDialerNewCalls(() => { loadCounts(); });
    onDialerReviewProgress((data) => setReviewProgress(data));
  }, [loadCounts]);

  const handleLeadClick = (leadOrPhone: any) => {
    const phone = typeof leadOrPhone === 'string'
      ? leadOrPhone
      : leadOrPhone?.phone_normalized;
    if (phone) setSelectedLeadPhone(phone);
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'queue', label: 'Call Queue', count: queueCount },
    { key: 'history', label: 'History', count: todayCalls },
    { key: 'dnc', label: 'DNC List', count: dncCount },
    { key: 'stats', label: 'Stats' },
    { key: 'upload', label: 'Upload' },
  ];

  return (
    <>
      <TopBar
        title="AI Dialer"
        subtitle={`${todayCalls} calls today`}
        actions={<LaunchCadenceButton />}
      />

      <div className="flex-1 overflow-auto p-5">
        <div className="max-w-6xl mx-auto space-y-5">
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

          {/* Tab panels */}
          {activeTab === 'queue' && (
            <CallQueuePanel searchQuery={searchQuery} onLeadClick={handleLeadClick} />
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
        </div>
      </div>

      {/* Lead detail modal */}
      {selectedLeadPhone && (
        <DialerLeadModal
          phoneNormalized={selectedLeadPhone}
          onClose={() => setSelectedLeadPhone(null)}
        />
      )}
    </>
  );
};
