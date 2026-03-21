import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Phone, Search, Maximize2, Minimize2, RefreshCw, Loader2, X, Users, Download } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { CallQueuePanel } from '../components/dialer/CallQueuePanel';
import { CallHistoryPanel } from '../components/dialer/CallHistoryPanel';
import { DNCPanel } from '../components/dialer/DNCPanel';
import { UploadPanel } from '../components/dialer/UploadPanel';
import { CadenceVisualization } from '../components/dialer/CadenceVisualization';
import { LeadDetailSlideOver } from '../components/dialer/LeadDetailSlideOver';
import { FilterSidebar, type SortKey } from '../components/dialer/FilterSidebar';
import { StatsSummaryStrip } from '../components/dialer/StatsSummaryStrip';
import { AccordionSection } from '../components/dialer/AccordionSection';
import { StatsPanel } from '../components/dialer/StatsPanel';
import { InboundCallPanel } from '../components/dialer/InboundCallPanel';
import { cn } from '../lib/utils';
import {
  fetchDialerTodayCallCount,
  fetchLocalDialerCallQueue,
  fetchLocalDialerDNCList,
  onDialerNewCalls,
  onDialerReviewProgress,
  onDialerInboundCall,
  onDialerCacheUpdated,
  forceDialerSync,
  dialerCallLead,
  fetchRetellPhoneNumbers,
  fetchNumberHealth,
  fetchNumberThrottle,
  setNumberLimits,
  setNumberPaused,
  fetchCampaignCapacity,
  startBatchDial,
  onBatchDialProgress,
} from '../lib/database';
import { formatPhone } from '../lib/utils/phone';
import { exportCampaignResultCsv } from '../lib/csv-export';
import { useToast } from '../components/ui/Toast';

type View = 'queue' | 'history' | 'manage';
type RightPanelMode = 'none' | 'selection' | 'detail';

interface ThrottleData {
  phone: string; callsToday: number; callsThisHour: number;
  dailyLimit: number; hourlyLimit: number; dailyRemaining: number; hourlyRemaining: number;
  paused: boolean; pausedReason: string | null; lastCallAt: string | null;
  throttled: boolean; throttleReason: string | null;
}

export const AIDialer: React.FC = () => {
  const { showToast } = useToast();
  const [activeView, setActiveView] = useState<View>('queue');
  const [searchQuery, setSearchQuery] = useState('');
  const [todayCalls, setTodayCalls] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [dncCount, setDNCCount] = useState(0);
  const [selectedLeadPhone, setSelectedLeadPhone] = useState<string | null>(null);
  const [reviewProgress, setReviewProgress] = useState<{ current: number; total: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const sessionStartRef = useRef(Date.now());
  const [callsPerHour, setCallsPerHour] = useState<number | null>(null);

  // From number selection
  const [availableNumbers, setAvailableNumbers] = useState<Array<{ phone_number: string; phone_number_pretty: string; nickname: string | null; inbound_only?: boolean }>>([]);
  const [selectedFromNumber, setSelectedFromNumber] = useState<string>('');

  // List-based dialing
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);

  // Lifted filter/sort state (previously in CallQueuePanel)
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCounty, setSelectedCounty] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortKey>('priority');
  const [marketValueMin, setMarketValueMin] = useState<number | null>(null);
  const [marketValueMax, setMarketValueMax] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Leads loaded from queue (for deriving geo options)
  const [queueLeads, setQueueLeads] = useState<any[]>([]);

  // Right panel
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('none');

  // Campaign state
  const [campaignFromNumbers, setCampaignFromNumbers] = useState<Set<string>>(new Set());
  const [numberHealth, setNumberHealth] = useState<Record<string, { totalCalls: number; connected: number; connectRate: number; flagged: boolean }>>({});
  const [numberThrottle, setNumberThrottle] = useState<Record<string, ThrottleData>>({});
  const [campaignCapacity, setCampaignCapacity] = useState(0);
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState<any>(null);
  const [campaignResult, setCampaignResult] = useState<any>(null);

  // ── Derived geo options ──

  const stateOptions = useMemo(() => {
    const states = new Map<string, number>();
    for (const l of queueLeads) {
      const st = (l.state || '').trim();
      if (st) states.set(st, (states.get(st) || 0) + 1);
    }
    return Array.from(states.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([st, count]) => ({ value: st, label: `${st} (${count})` }));
  }, [queueLeads]);

  const countyOptions = useMemo(() => {
    const counties = new Map<string, number>();
    for (const l of queueLeads) {
      if (selectedState && (l.state || '').trim() !== selectedState) continue;
      const county = (l.county || '').trim();
      if (county) counties.set(county, (counties.get(county) || 0) + 1);
    }
    return Array.from(counties.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([c, count]) => ({ value: c, label: `${c} (${count})` }));
  }, [queueLeads, selectedState]);

  // Reset county when state changes
  useEffect(() => { setSelectedCounty(''); }, [selectedState]);

  // Clear selections on list change
  useEffect(() => { setSelectedIds(new Set()); }, [selectedListIds]);

  // Auto-show right panel when leads selected
  useEffect(() => {
    if (selectedIds.size > 0 && !selectedLeadPhone) {
      setRightPanelMode('selection');
    } else if (selectedIds.size === 0 && rightPanelMode === 'selection') {
      setRightPanelMode('none');
    }
  }, [selectedIds.size, selectedLeadPhone, rightPanelMode]);

  // Show detail panel when a lead is clicked
  useEffect(() => {
    if (selectedLeadPhone) {
      setRightPanelMode('detail');
    }
  }, [selectedLeadPhone]);

  // Load number health + throttle when available numbers change
  const loadNumberStats = useCallback(async () => {
    if (availableNumbers.length === 0) return;
    const phones = availableNumbers.map(n => n.phone_number);
    try {
      const [healthStats, throttleStats] = await Promise.all([
        fetchNumberHealth(phones),
        fetchNumberThrottle(phones),
      ]);
      const healthMap: Record<string, any> = {};
      for (const s of healthStats) healthMap[s.phone] = s;
      setNumberHealth(healthMap);
      const throttleMap: Record<string, ThrottleData> = {};
      for (const t of throttleStats) throttleMap[t.phone] = t;
      setNumberThrottle(throttleMap);
    } catch (err) {
      console.error('Error loading number stats:', err);
    }
  }, [availableNumbers]);

  useEffect(() => {
    loadNumberStats().then(() => {
      // Auto-select all non-throttled, non-flagged, outbound-capable numbers for campaign
      const outboundNumbers = availableNumbers.filter(n => !n.inbound_only);
      const phones = outboundNumbers.map(n => n.phone_number);
      const healthy = new Set(phones.filter(p => !numberHealth[p]?.flagged && !numberThrottle[p]?.throttled));
      if (healthy.size > 0) setCampaignFromNumbers(healthy);
      else setCampaignFromNumbers(new Set(phones));
    });
  }, [availableNumbers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recalculate campaign capacity when selected numbers change
  useEffect(() => {
    if (campaignFromNumbers.size === 0) { setCampaignCapacity(0); return; }
    fetchCampaignCapacity(Array.from(campaignFromNumbers)).then(cap => {
      setCampaignCapacity(cap.totalDailyRemaining);
    }).catch(() => setCampaignCapacity(0));
  }, [campaignFromNumbers, numberThrottle]);

  // Campaign progress listener
  useEffect(() => {
    const unsub = onBatchDialProgress((data) => {
      setCampaignProgress(data);
      if (data.status === 'completed' || data.status === 'failed' || data.status === 'throttled') {
        setCampaignRunning(false);
        setCampaignResult(data);
        // Refresh throttle data after campaign ends
        loadNumberStats();
      }
    });
    return () => unsub();
  }, [loadNumberStats]);

  // ── Data Loading ──

  const loadCounts = useCallback(async () => {
    try {
      const [calls, queue, dnc] = await Promise.all([
        fetchDialerTodayCallCount(),
        fetchLocalDialerCallQueue(1000),
        fetchLocalDialerDNCList(),
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
    (async () => {
      try {
        const numbers = await fetchRetellPhoneNumbers();
        setAvailableNumbers(numbers);
        if (numbers.length > 0 && !selectedFromNumber) {
          setSelectedFromNumber(numbers[0].phone_number);
        }
      } catch (err) {
        console.error('Error loading Retell phone numbers:', err);
      }
    })();
  }, []);

  useEffect(() => {
    const unsub1 = onDialerNewCalls(() => { loadCounts(); });
    const unsub2 = onDialerReviewProgress((data) => setReviewProgress(data));
    const unsub3 = onDialerInboundCall((data) => {
      showToast({
        message: `Inbound call from ${data.leadName || data.phone}`,
        type: 'info',
      });
      loadCounts();
    });
    const unsub4 = onDialerCacheUpdated(() => { loadCounts(); });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [loadCounts, showToast]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsedMs = Date.now() - sessionStartRef.current;
      const elapsedHours = elapsedMs / (1000 * 60 * 60);
      if (elapsedHours >= 1 / 12) {
        setCallsPerHour(Math.round((todayCalls / elapsedHours) * 10) / 10);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [todayCalls]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedLeadPhone) setSelectedLeadPhone(null);
        if (rightPanelMode !== 'none') setRightPanelMode('none');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLeadPhone, rightPanelMode]);

  // ── Handlers ──

  const handleLeadClick = (leadOrPhone: any) => {
    const phone = typeof leadOrPhone === 'string'
      ? leadOrPhone
      : leadOrPhone?.phone_normalized;
    if (phone) setSelectedLeadPhone(phone);
  };

  const handleCallLead = async (lead: any) => {
    try {
      const leadWithNumber = selectedFromNumber
        ? { ...lead, from_number: selectedFromNumber }
        : lead;
      await dialerCallLead(leadWithNumber);
      showToast({ message: `Calling ${lead.first_name || lead.phone_normalized}...`, type: 'success' });
      loadCounts();
    } catch (err: any) {
      showToast({ message: err.message || 'Call failed', type: 'error' });
    }
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

  const handleLeadsLoaded = useCallback((leads: any[]) => {
    setQueueLeads(leads);
  }, []);



  const handleStartCampaign = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const numbers = Array.from(campaignFromNumbers);
    if (numbers.length === 0) {
      showToast({ message: 'Select at least one caller ID number', type: 'error' });
      return;
    }
    setCampaignRunning(true);
    setCampaignProgress(null);
    setCampaignResult(null);
    try {
      const result = await startBatchDial(ids, numbers);
      setCampaignResult(result);
      showToast({ message: `Campaign complete: ${result.dialed} dialed`, type: 'success' });
    } catch (err: any) {
      showToast({ message: err.message || 'Campaign failed', type: 'error' });
    } finally {
      setCampaignRunning(false);
    }
  };

  const toggleCampaignNumber = (phone: string) => {
    setCampaignFromNumbers(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  };

  // ── View Navigation ──

  const views: { key: View; label: string; count?: number }[] = [
    { key: 'queue', label: 'Queue', count: queueCount },
    { key: 'history', label: 'History', count: todayCalls },
    { key: 'manage', label: 'Manage' },
  ];

  // ── Right Panel Content ──

  const rightPanelContent = () => {
    if (rightPanelMode === 'detail' && selectedLeadPhone) {
      return (
        <LeadDetailSlideOver
          phoneNormalized={selectedLeadPhone}
          onClose={() => {
            setSelectedLeadPhone(null);
            setRightPanelMode(selectedIds.size > 0 ? 'selection' : 'none');
          }}
          onCallLead={handleCallLead}
          onLeadChanged={() => loadCounts()}
        />
      );
    }

    if (rightPanelMode === 'selection' && selectedIds.size > 0) {
      const selectedLeads = queueLeads.filter(l => selectedIds.has(l.id));
      const pct = campaignProgress
        ? Math.round((campaignProgress.dialedCount / campaignProgress.totalLeads) * 100)
        : 0;

      return (
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Users size={14} />
              {campaignRunning ? 'Campaign Running' : campaignResult ? 'Campaign Complete' : 'Campaign Setup'}
            </h3>
            <button
              onClick={() => {
                if (!campaignRunning) {
                  setSelectedIds(new Set());
                  setRightPanelMode('none');
                  setCampaignResult(null);
                  setCampaignProgress(null);
                }
              }}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Lead count */}
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900 tabular-nums">{selectedIds.size}</div>
              <div className="text-micro text-gray-500">leads selected</div>
            </div>

            {/* ── Campaign Progress ── */}
            {(campaignRunning || campaignProgress) && campaignProgress && (
              <div className="space-y-3">
                <div className="bg-blue-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-micro text-gray-600">
                  <span>{campaignProgress.currentLeadName ? `Calling ${campaignProgress.currentLeadName}` : `Batch ${campaignProgress.currentBatch}/${campaignProgress.totalBatches}`}</span>
                  <span className="tabular-nums font-medium">{campaignProgress.dialedCount}/{campaignProgress.totalLeads} ({pct}%)</span>
                </div>

                {/* Per-number stats */}
                {campaignProgress.numberStats && Object.keys(campaignProgress.numberStats).length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-micro font-medium text-gray-500 uppercase tracking-wide">Number Stats</div>
                    {Object.entries(campaignProgress.numberStats).map(([phone, stats]: [string, any]) => {
                      const rate = stats.dialed > 0 ? Math.round((stats.connected / stats.dialed) * 100) : 0;
                      return (
                        <div key={phone} className="flex items-center justify-between px-2 py-1 rounded bg-gray-50 text-micro">
                          <span className="text-gray-700 font-mono">{formatPhone(phone)}</span>
                          <span className="text-gray-500 tabular-nums">{stats.dialed} calls {rate > 0 ? `· ${rate}%` : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Campaign Results Dashboard ── */}
            {campaignResult && !campaignRunning && (() => {
              const dialed = campaignResult.dialed ?? campaignResult.dialedCount ?? 0;
              const connected = campaignResult.connected ?? 0;
              const failed = campaignResult.failed ?? campaignResult.errors ?? 0;
              const guarded = campaignResult.skippedGuard ?? 0;
              const dnc = campaignResult.skippedDnc ?? 0;
              const connectRate = dialed > 0 ? Math.round((connected / dialed) * 100) : 0;
              const durationMin = Math.round((campaignResult.durationSeconds ?? 0) / 60);
              const ns = campaignResult.numberStats as Record<string, { dialed: number; connected: number; noAnswer: number; failed: number }> | undefined;
              const details = (campaignResult.details || []) as Array<{ leadId: string; phone: string; status: string; guardReason?: string; guardDetails?: string; error?: string }>;

              // Guard reason breakdown
              const guardReasons: Record<string, number> = {};
              for (const d of details) {
                if (d.status === 'guard_blocked' && d.guardReason) {
                  guardReasons[d.guardReason] = (guardReasons[d.guardReason] || 0) + 1;
                }
                if (d.status === 'dnc_skipped') {
                  guardReasons['dnc_listed'] = (guardReasons['dnc_listed'] || 0) + 1;
                }
              }

              // Failed call breakdown
              const failedDetails = details.filter(d => d.status === 'error' && d.error);
              const failedReasons: Record<string, number> = {};
              for (const d of failedDetails) {
                const reason = d.error || 'Unknown error';
                // Simplify Retell API errors to readable labels
                const label = reason.includes('429') ? 'Rate limited (429)'
                  : reason.includes('402') ? 'Insufficient credits (402)'
                  : reason.includes('400') ? 'Bad request (400)'
                  : reason.includes('Retell API error') ? reason.replace(/Retell API error /, 'API ')
                  : reason.length > 60 ? reason.slice(0, 57) + '...'
                  : reason;
                failedReasons[label] = (failedReasons[label] || 0) + 1;
              }
              const guardReasonLabels: Record<string, string> = {
                dnc_listed: 'DNC Listed',
                same_number_used: 'Same Number Used',
                final_outcome_set: 'Final Outcome Set',
                real_conversation: 'Real Conversation',
                called_recently: 'Called Recently',
                cadence_not_due: 'Cadence Not Due',
              };

              // Leads that connected (follow-up needed)
              const connectedLeads = details.filter(d => d.status === 'dialed');

              return (
                <div className="space-y-4">
                  {/* Connect rate hero */}
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-900 tabular-nums">{connectRate}%</div>
                    <div className="text-micro text-gray-500">Connect Rate</div>
                    {durationMin > 0 && (
                      <div className="text-micro text-gray-400 mt-0.5">{durationMin}m campaign</div>
                    )}
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-4 gap-1.5">
                    <div className="bg-gray-50 rounded-md px-2 py-2 text-center">
                      <div className="text-base font-bold text-gray-900 tabular-nums">{dialed}</div>
                      <div className="text-[10px] text-gray-500">Dialed</div>
                    </div>
                    <div className="bg-green-50 rounded-md px-2 py-2 text-center">
                      <div className="text-base font-bold text-green-600 tabular-nums">{connected}</div>
                      <div className="text-[10px] text-gray-500">Connected</div>
                    </div>
                    <div className="bg-amber-50 rounded-md px-2 py-2 text-center">
                      <div className="text-base font-bold text-amber-600 tabular-nums">{guarded + dnc}</div>
                      <div className="text-[10px] text-gray-500">Blocked</div>
                    </div>
                    <div className="bg-red-50 rounded-md px-2 py-2 text-center">
                      <div className="text-base font-bold text-red-600 tabular-nums">{failed}</div>
                      <div className="text-[10px] text-gray-500">Failed</div>
                    </div>
                  </div>

                  {/* Per-number performance */}
                  {ns && Object.keys(ns).length > 0 && (
                    <div>
                      <div className="text-micro font-medium text-gray-500 uppercase tracking-wide mb-1.5">Number Performance</div>
                      <div className="space-y-1">
                        {Object.entries(ns).map(([phone, stats]) => {
                          const rate = stats.dialed > 0 ? Math.round((stats.connected / stats.dialed) * 100) : 0;
                          const barWidth = stats.dialed > 0 ? Math.max(4, rate) : 0;
                          return (
                            <div key={phone} className="bg-gray-50 rounded-md px-2.5 py-1.5">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-micro font-mono text-gray-700">{formatPhone(phone)}</span>
                                <span className="text-micro text-gray-500 tabular-nums">{rate}%</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={cn('h-full rounded-full', rate >= 15 ? 'bg-green-500' : rate >= 5 ? 'bg-amber-400' : 'bg-red-400')}
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-gray-400 tabular-nums w-16 text-right">
                                  {stats.dialed}d {stats.connected}c {stats.failed}f
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Guard reason breakdown */}
                  {Object.keys(guardReasons).length > 0 && (
                    <div>
                      <div className="text-micro font-medium text-gray-500 uppercase tracking-wide mb-1.5">Blocked Breakdown</div>
                      <div className="space-y-0.5">
                        {Object.entries(guardReasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                          <div key={reason} className="flex items-center justify-between px-2.5 py-1 text-micro">
                            <span className="text-gray-600">{guardReasonLabels[reason] || reason}</span>
                            <span className="text-gray-500 tabular-nums font-medium">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Failed reason breakdown */}
                  {Object.keys(failedReasons).length > 0 && (
                    <div>
                      <div className="text-micro font-medium text-gray-500 uppercase tracking-wide mb-1.5">Failed Breakdown</div>
                      <div className="space-y-0.5">
                        {Object.entries(failedReasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                          <div key={reason} className="flex items-center justify-between px-2.5 py-1 text-micro">
                            <span className="text-red-600">{reason}</span>
                            <span className="text-gray-500 tabular-nums font-medium">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow-up needed */}
                  {connectedLeads.length > 0 && (
                    <div>
                      <div className="text-micro font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                        Dialed Leads ({connectedLeads.length})
                      </div>
                      <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
                        {connectedLeads.map((d, i) => (
                          <button
                            key={i}
                            onClick={() => handleLeadClick(d.phone)}
                            className="w-full flex items-center justify-between px-2.5 py-1 text-micro text-left rounded hover:bg-gray-50 transition-colors"
                          >
                            <span className="text-gray-700 font-mono">{formatPhone(d.phone)}</span>
                            <span className="text-gray-400">{d.status}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Export CSV */}
                  <button
                    onClick={() => exportCampaignResultCsv(campaignResult)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-caption text-gray-600 font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Download size={12} />
                    Export Results CSV
                  </button>
                </div>
              );
            })()}

            {/* ── Number Selection (pre-campaign) ── */}
            {!campaignRunning && !campaignResult && availableNumbers.length > 0 && (
              <div>
                <div className="text-micro font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Caller IDs (select 1+)
                </div>
                <div className="space-y-1.5">
                  {availableNumbers.map(n => {
                    const health = numberHealth[n.phone_number];
                    const throttle = numberThrottle[n.phone_number];
                    const isSelected = campaignFromNumbers.has(n.phone_number);
                    const isFlagged = health?.flagged;
                    const isThrottled = throttle?.throttled;
                    const isInboundOnly = n.inbound_only;

                    if (isInboundOnly) {
                      return (
                        <div
                          key={n.phone_number}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-300" />
                            <div className="min-w-0">
                              <div className="text-caption font-medium text-gray-500 truncate">
                                {n.nickname ? `${n.nickname}` : ''} {n.phone_number_pretty}
                              </div>
                              <span className="text-[10px] text-gray-400">Inbound only</span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={n.phone_number}
                        onClick={() => toggleCampaignNumber(n.phone_number)}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors',
                          isSelected
                            ? isThrottled ? 'border-red-300 bg-red-50' : 'border-blue-300 bg-blue-50'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={cn(
                            'w-2 h-2 rounded-full flex-shrink-0',
                            isThrottled ? 'bg-red-500 animate-pulse' : isFlagged ? 'bg-red-500' : health && health.connectRate >= 0 ? 'bg-green-500' : 'bg-gray-300'
                          )} />
                          <div className="min-w-0">
                            <div className="text-caption font-medium text-gray-800 truncate">
                              {n.nickname ? `${n.nickname}` : ''} {n.phone_number_pretty}
                            </div>
                            <div className="flex items-center gap-2">
                              {health && health.connectRate >= 0 && (
                                <span className={cn('text-[10px]', isFlagged ? 'text-red-600' : 'text-gray-400')}>
                                  {health.connectRate}% rate
                                  {isFlagged && ' · Scam Likely'}
                                </span>
                              )}
                              {throttle && (
                                <span className={cn('text-[10px] tabular-nums',
                                  isThrottled ? 'text-red-600 font-medium' : throttle.dailyRemaining <= 10 ? 'text-amber-600' : 'text-gray-400'
                                )}>
                                  {throttle.dailyRemaining} left today · {throttle.hourlyRemaining}/hr
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                          isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                        )}>
                          {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="text-micro text-gray-400 mt-1.5">
                  {campaignFromNumbers.size > 1 ? `Round-robin · ${campaignCapacity} calls remaining` : campaignFromNumbers.size === 1 ? `Single number · ${campaignCapacity} calls remaining` : 'Select a number'}
                </div>
              </div>
            )}

            {/* Throttle warnings */}
            {!campaignRunning && !campaignResult && campaignFromNumbers.size > 0 && campaignCapacity === 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-micro text-red-700">
                <strong>All numbers throttled.</strong> Selected numbers have hit their daily or hourly call limits. Wait for limits to reset or add more numbers.
              </div>
            )}
            {!campaignRunning && !campaignResult && campaignFromNumbers.size > 0 && campaignCapacity > 0 && selectedIds.size > campaignCapacity && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-micro text-amber-700">
                <strong>Capacity warning:</strong> {selectedIds.size} leads selected but only {campaignCapacity} calls remaining across selected numbers. Campaign will auto-stop when limits are reached.
              </div>
            )}

            {/* Start Campaign button */}
            {!campaignRunning && !campaignResult && (
              <button
                onClick={handleStartCampaign}
                disabled={selectedIds.size === 0 || campaignFromNumbers.size === 0 || campaignCapacity === 0}
                className="w-full py-2.5 bg-emerald-500 text-white text-caption font-semibold rounded-lg hover:bg-emerald-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {campaignCapacity === 0 ? 'All numbers at limit' : `Start Campaign (${Math.min(selectedIds.size, campaignCapacity)} of ${selectedIds.size} leads)`}
              </button>
            )}

            {/* Done button after campaign */}
            {campaignResult && !campaignRunning && (
              <button
                onClick={() => {
                  setSelectedIds(new Set());
                  setCampaignResult(null);
                  setCampaignProgress(null);
                  setRightPanelMode('none');
                }}
                className="w-full py-2.5 bg-gray-900 text-white text-caption font-semibold rounded-lg hover:bg-gray-800 transition-colors"
              >
                Done
              </button>
            )}

            {/* Selected leads list (pre-campaign only) */}
            {!campaignRunning && !campaignResult && (
              <div>
                <div className="text-micro font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Selected Leads
                </div>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {selectedLeads.map(lead => {
                    const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
                    return (
                      <div
                        key={lead.id}
                        className="flex items-center justify-between px-2 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <button
                          onClick={() => handleLeadClick(lead)}
                          className="text-micro font-medium text-gray-700 truncate text-left flex-1 min-w-0"
                        >
                          {name}
                        </button>
                        <button
                          onClick={() => {
                            const next = new Set(selectedIds);
                            next.delete(lead.id);
                            setSelectedIds(next);
                          }}
                          className="ml-1 p-0.5 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  const showRightPanel = rightPanelMode !== 'none';

  // ── Shared Content ──

  const dialerContent = (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ═══ Command Bar ═══ */}
      <div className="bg-white border-b border-gray-200 px-5 flex-shrink-0">
        <div className="flex items-center justify-between h-12">
          {/* Left: View navigation */}
          <div className="flex items-center gap-1">
            {views.map(v => (
              <button
                key={v.key}
                className={cn(
                  'px-3 py-1.5 text-caption font-medium rounded-md transition-colors whitespace-nowrap',
                  activeView === v.key
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                )}
                onClick={() => setActiveView(v.key)}
              >
                {v.label}
                {v.count !== undefined && v.count > 0 && (
                  <span className={cn(
                    'ml-1.5 text-micro px-1.5 py-0.5 rounded-full tabular-nums',
                    activeView === v.key
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-100 text-gray-500'
                  )}>
                    {v.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Right: Stats + Actions */}
          <div className="flex items-center gap-2">
            <StatsSummaryStrip />
            <div className="w-px h-5 bg-gray-200" />

            {/* From Number Selector */}
            {availableNumbers.length > 0 && (
              <>
                <div className="flex items-center gap-1">
                  <Phone size={12} className="text-gray-400" />
                  <select
                    value={selectedFromNumber}
                    onChange={(e) => setSelectedFromNumber(e.target.value)}
                    className="text-micro bg-white border border-gray-200 rounded-md px-2 py-1 pr-6 focus:outline-none focus:ring-1 focus:ring-blue-300 text-gray-700 cursor-pointer"
                    title="Caller ID number"
                  >
                    {availableNumbers.map(n => (
                      <option key={n.phone_number} value={n.phone_number}>
                        {n.nickname
                          ? `${n.nickname} ${n.phone_number_pretty}`
                          : n.phone_number_pretty}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-px h-5 bg-gray-200" />
              </>
            )}

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-caption border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-48 transition-colors bg-gray-50 focus:bg-white"
              />
            </div>

            {/* Sync */}
            <button
              onClick={handleForceSync}
              disabled={syncing}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
              title="Force sync"
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>

            {/* Expand */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
              title={expanded ? 'Exit full screen' : 'Full screen'}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ AI Review Progress ═══ */}
      {reviewProgress && (
        <div className="bg-blue-50 border-b border-blue-200 px-5 py-2 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-caption font-medium text-blue-800">
              Reviewing call transcripts...
            </span>
            <span className="text-micro text-blue-600 tabular-nums">
              {reviewProgress.current}/{reviewProgress.total}
            </span>
          </div>
          <div className="bg-blue-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${(reviewProgress.current / reviewProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ═══ Main Content Area ═══ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left: Filter Sidebar (queue view only) ── */}
        {activeView === 'queue' && (
          <FilterSidebar
            selectedState={selectedState}
            onStateChange={setSelectedState}
            selectedCounty={selectedCounty}
            onCountyChange={setSelectedCounty}
            stateOptions={stateOptions}
            countyOptions={countyOptions}
            sortBy={sortBy}
            onSortChange={setSortBy}
            marketValueMin={marketValueMin}
            onMarketValueMinChange={setMarketValueMin}
            marketValueMax={marketValueMax}
            onMarketValueMaxChange={setMarketValueMax}
            selectedListIds={selectedListIds}
            onListSelectionChange={setSelectedListIds}
            onLeadClick={handleLeadClick}
            onCallLead={handleCallLead}
            callingLeadId={null}
          />
        )}

        {/* ── Center: Content Area ── */}
        <div className="flex-1 overflow-auto">
          <div className={cn('p-4', !expanded && activeView !== 'queue' && 'max-w-6xl mx-auto')}>
            {/* Queue View */}
            {activeView === 'queue' && (
              <CallQueuePanel
                searchQuery={searchQuery}
                onLeadClick={handleLeadClick}
                listIds={selectedListIds.length > 0 ? selectedListIds : undefined}
                browseMode={selectedListIds.length > 0}
                selectedLeadPhone={selectedLeadPhone}
                fromNumber={selectedFromNumber || undefined}
                selectedState={selectedState}
                selectedCounty={selectedCounty}
                sortBy={sortBy}
                marketValueMin={marketValueMin}
                marketValueMax={marketValueMax}
                selectedIds={selectedIds}
                onSelectedIdsChange={setSelectedIds}
                onLeadsLoaded={handleLeadsLoaded}
              />
            )}

            {/* History View */}
            {activeView === 'history' && (
              <div className="space-y-4">
                <CallHistoryPanel searchQuery={searchQuery} onLeadClick={handleLeadClick} />
                <AccordionSection title="Inbound Calls">
                  <InboundCallPanel searchQuery={searchQuery} onLeadClick={handleLeadClick} />
                </AccordionSection>
              </div>
            )}

            {/* Manage View */}
            {activeView === 'manage' && (
              <div className="space-y-3">
                <AccordionSection title="Upload Leads" defaultOpen>
                  <UploadPanel />
                </AccordionSection>
                <AccordionSection title="DNC List" count={dncCount}>
                  <DNCPanel searchQuery={searchQuery} />
                </AccordionSection>
                <AccordionSection title="Cadence Pipeline">
                  <CadenceVisualization />
                </AccordionSection>
                <AccordionSection title="Stats Detail">
                  <StatsPanel />
                </AccordionSection>
                {availableNumbers.length > 0 && (
                  <AccordionSection title="Number Health">
                    <NumberHealthDashboard
                      availableNumbers={availableNumbers}
                      numberHealth={numberHealth}
                      onRefresh={async () => {
                        const phones = availableNumbers.map(n => n.phone_number);
                        const stats = await fetchNumberHealth(phones);
                        const map: Record<string, any> = {};
                        for (const s of stats) map[s.phone] = s;
                        setNumberHealth(map);
                        showToast({ message: 'Number health refreshed', type: 'success' });
                      }}
                    />
                  </AccordionSection>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Context Panel ── */}
        <div
          className={cn(
            'flex-shrink-0 overflow-hidden border-l bg-white',
            'transition-[width,border-color] duration-300 ease-out',
            showRightPanel
              ? 'w-[400px] border-gray-200 shadow-[-4px_0_16px_rgba(0,0,0,0.04)]'
              : 'w-0 border-transparent'
          )}
        >
          <div className="w-[400px] h-full">
            {rightPanelContent()}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Expanded (Full Screen) Mode ──

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Phone size={18} className="text-blue-600" />
            <h1 className="text-base font-semibold text-gray-900">AI Dialer</h1>
            <span className="text-caption text-gray-500">
              {todayCalls} calls today{callsPerHour != null ? ` \u00b7 ${callsPerHour}/hr` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(false)}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            >
              <Minimize2 size={16} />
            </button>
          </div>
        </div>
        {dialerContent}
      </div>
    );
  }

  // ── Normal Mode ──

  return (
    <>
      <TopBar
        title="AI Dialer"
        subtitle={`${todayCalls} calls today${callsPerHour != null ? ` \u00b7 ${callsPerHour}/hr` : ''}`}
        actions={undefined}
      />
      {dialerContent}
    </>
  );
};

// ── Number Health Dashboard (inline) ──

const NumberHealthDashboard: React.FC<{
  availableNumbers: Array<{ phone_number: string; phone_number_pretty: string; nickname: string | null }>;
  numberHealth: Record<string, { totalCalls: number; connected: number; connectRate: number; flagged: boolean }>;
  onRefresh: () => void;
}> = ({ availableNumbers, numberHealth, onRefresh }) => {
  const [throttleData, setThrottleData] = useState<Record<string, ThrottleData>>({});
  const [editingLimits, setEditingLimits] = useState<string | null>(null);
  const [editDaily, setEditDaily] = useState(40);
  const [editHourly, setEditHourly] = useState(8);

  const loadThrottle = useCallback(async () => {
    const phones = availableNumbers.map(n => n.phone_number);
    if (phones.length === 0) return;
    const data = await fetchNumberThrottle(phones);
    const map: Record<string, ThrottleData> = {};
    for (const d of data) map[d.phone] = d;
    setThrottleData(map);
  }, [availableNumbers]);

  useEffect(() => { loadThrottle(); }, [loadThrottle]);

  const handleRefresh = () => { onRefresh(); loadThrottle(); };

  const handleSaveLimits = async (phone: string) => {
    await setNumberLimits(phone, editDaily, editHourly);
    setEditingLimits(null);
    loadThrottle();
  };

  const handleTogglePause = async (phone: string, currentlyPaused: boolean) => {
    await setNumberPaused(phone, !currentlyPaused, !currentlyPaused ? 'Manually paused' : undefined);
    loadThrottle();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-caption text-gray-500">Number health + throttle limits</span>
        <button onClick={handleRefresh} className="text-micro text-blue-600 hover:text-blue-700 font-medium">
          Refresh
        </button>
      </div>

      {/* Spam prevention info */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-micro text-amber-700">
        <strong>Spam prevention:</strong> Default limits: 100/day, 15/hour per number. Editable per number below.
      </div>

      <div className="space-y-2">
        {availableNumbers.map(n => {
          const health = numberHealth[n.phone_number];
          const throttle = throttleData[n.phone_number];
          const hasHealth = health && health.connectRate >= 0;
          const dailyPct = throttle ? Math.round((throttle.callsToday / throttle.dailyLimit) * 100) : 0;
          const hourlyPct = throttle ? Math.round((throttle.callsThisHour / throttle.hourlyLimit) * 100) : 0;
          const isEditing = editingLimits === n.phone_number;

          return (
            <div key={n.phone_number} className={cn(
              "bg-white rounded-lg border p-3 space-y-2",
              throttle?.throttled ? "border-red-200 bg-red-50/30" : throttle?.paused ? "border-yellow-200 bg-yellow-50/30" : "border-gray-200"
            )}>
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full",
                    throttle?.throttled ? "bg-red-500" : throttle?.paused ? "bg-yellow-500" : health?.flagged ? "bg-red-500" : hasHealth ? "bg-green-500" : "bg-gray-300"
                  )} />
                  <span className="text-sm font-medium text-gray-800">{n.phone_number_pretty}</span>
                  {n.nickname && <span className="text-micro text-gray-400">({n.nickname})</span>}
                </div>
                <div className="flex items-center gap-2">
                  {/* Health badge */}
                  {health?.flagged && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-micro bg-red-100 text-red-600 font-medium">Scam Likely</span>
                  )}
                  {throttle?.throttled && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-micro bg-red-100 text-red-600 font-medium">Throttled</span>
                  )}
                  {/* Pause toggle */}
                  <button
                    onClick={() => handleTogglePause(n.phone_number, throttle?.paused || false)}
                    className={cn("text-micro px-2 py-0.5 rounded font-medium",
                      throttle?.paused ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                    )}
                  >
                    {throttle?.paused ? 'Resume' : 'Pause'}
                  </button>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3 text-micro">
                <div>
                  <div className="text-gray-400">24h Calls</div>
                  <div className="font-medium tabular-nums text-gray-700">{hasHealth ? health.totalCalls : '—'}</div>
                </div>
                <div>
                  <div className="text-gray-400">Connected</div>
                  <div className="font-medium tabular-nums text-gray-700">{hasHealth ? health.connected : '—'}</div>
                </div>
                <div>
                  <div className="text-gray-400">Rate</div>
                  <div className={cn("font-medium tabular-nums", health?.flagged ? "text-red-600" : "text-gray-700")}>
                    {hasHealth ? `${health.connectRate}%` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Last Call</div>
                  <div className="font-medium text-gray-700 truncate">
                    {throttle?.lastCallAt ? new Date(throttle.lastCallAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </div>
                </div>
              </div>

              {/* Throttle bars */}
              {throttle && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-micro text-gray-400 w-12">Daily</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all",
                        dailyPct >= 100 ? "bg-red-500" : dailyPct >= 75 ? "bg-amber-500" : "bg-blue-500"
                      )} style={{ width: `${Math.min(100, dailyPct)}%` }} />
                    </div>
                    <span className="text-micro tabular-nums text-gray-500 w-16 text-right">
                      {throttle.callsToday}/{throttle.dailyLimit}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-micro text-gray-400 w-12">Hourly</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all",
                        hourlyPct >= 100 ? "bg-red-500" : hourlyPct >= 75 ? "bg-amber-500" : "bg-blue-500"
                      )} style={{ width: `${Math.min(100, hourlyPct)}%` }} />
                    </div>
                    <span className="text-micro tabular-nums text-gray-500 w-16 text-right">
                      {throttle.callsThisHour}/{throttle.hourlyLimit}
                    </span>
                  </div>
                </div>
              )}

              {/* Edit limits */}
              {isEditing ? (
                <div className="flex items-center gap-2 pt-1">
                  <label className="text-micro text-gray-500">Daily:</label>
                  <input type="number" value={editDaily} onChange={e => setEditDaily(Number(e.target.value))}
                    className="w-14 px-1.5 py-0.5 text-micro border rounded text-center" min={1} max={200} />
                  <label className="text-micro text-gray-500">Hourly:</label>
                  <input type="number" value={editHourly} onChange={e => setEditHourly(Number(e.target.value))}
                    className="w-14 px-1.5 py-0.5 text-micro border rounded text-center" min={1} max={50} />
                  <button onClick={() => handleSaveLimits(n.phone_number)}
                    className="text-micro px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium hover:bg-blue-200">Save</button>
                  <button onClick={() => setEditingLimits(null)}
                    className="text-micro px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">Cancel</button>
                </div>
              ) : (
                <button onClick={() => { setEditingLimits(n.phone_number); setEditDaily(throttle?.dailyLimit || 40); setEditHourly(throttle?.hourlyLimit || 8); }}
                  className="text-micro text-gray-400 hover:text-blue-600">
                  Edit limits
                </button>
              )}

              {/* Throttle reason */}
              {throttle?.throttled && throttle.throttleReason && (
                <div className="text-micro text-red-600 font-medium">{throttle.throttleReason}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
