import React, { useEffect, useState, useCallback } from 'react';
import {
  Phone, MessageSquare, Mail, StickyNote, RefreshCw,
  PhoneIncoming, PhoneOutgoing, ArrowDownLeft, ArrowUpRight,
  Clock, Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getFubActivities, syncFubActivities } from '../../lib/database';

type ActivityType = 'all' | 'note' | 'call' | 'text' | 'email';

interface Activity {
  id: number;
  activity_type: 'note' | 'call' | 'text' | 'email';
  direction?: 'inbound' | 'outbound' | null;
  subject?: string | null;
  body?: string | null;
  from_number?: string | null;
  to_number?: string | null;
  duration?: number | null;
  outcome?: string | null;
  status?: string | null;
  created_by?: string | null;
  activity_date: string;
}

interface DealActivityProps {
  dealId: string;
  fubPersonId?: string;
}

const FILTERS: { id: ActivityType; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All', icon: null },
  { id: 'note', label: 'Notes', icon: <StickyNote size={12} /> },
  { id: 'call', label: 'Calls', icon: <Phone size={12} /> },
  { id: 'text', label: 'Texts', icon: <MessageSquare size={12} /> },
  { id: 'email', label: 'Emails', icon: <Mail size={12} /> },
];

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

const activityIcon = (type: string, direction?: string | null) => {
  if (type === 'call') {
    return direction === 'inbound'
      ? <PhoneIncoming size={14} className="text-blue-500" />
      : <PhoneOutgoing size={14} className="text-green-500" />;
  }
  if (type === 'text') {
    return direction === 'inbound'
      ? <ArrowDownLeft size={14} className="text-purple-500" />
      : <ArrowUpRight size={14} className="text-indigo-500" />;
  }
  if (type === 'email') return <Mail size={14} className="text-amber-500" />;
  return <StickyNote size={14} className="text-gray-500" />;
};

const activityLabel = (type: string, direction?: string | null): string => {
  if (type === 'call') return direction === 'inbound' ? 'Incoming Call' : 'Outgoing Call';
  if (type === 'text') return direction === 'inbound' ? 'Text Received' : 'Text Sent';
  if (type === 'email') return direction === 'inbound' ? 'Email Received' : 'Email Sent';
  return 'Note';
};

export const DealActivity: React.FC<DealActivityProps> = ({ dealId, fubPersonId }) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<ActivityType>('all');
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const loadActivities = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFubActivities(dealId, filter === 'all' ? undefined : filter);
      setActivities(data);
    } catch (err) {
      console.error('Failed to load activities:', err);
    } finally {
      setLoading(false);
    }
  }, [dealId, filter]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncFubActivities(dealId);
      if (result.success) {
        setSyncResult(`Synced ${result.notes || 0} notes, ${result.calls || 0} calls, ${result.texts || 0} texts`);
        loadActivities();
      } else {
        setSyncResult(result.error || 'Sync failed');
      }
    } catch (err) {
      setSyncResult('Sync error');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 4000);
    }
  };

  // Auto-sync on first mount if no activities and has FUB link
  useEffect(() => {
    if (fubPersonId && activities.length === 0 && !loading && !syncing) {
      handleSync();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group activities by date
  const grouped = activities.reduce<Record<string, Activity[]>>((acc, act) => {
    const date = formatDate(act.activity_date);
    if (!acc[date]) acc[date] = [];
    acc[date].push(act);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header with sync button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1',
                filter === f.id
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>
        {fubPersonId && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
          >
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        )}
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded animate-fade-in">
          {syncResult}
        </div>
      )}

      {/* Activity timeline */}
      {loading && activities.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-8">Loading activities...</div>
      ) : activities.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-8">
          {fubPersonId ? 'No activities yet. Click Sync to pull from FUB.' : 'No FUB link — activities unavailable.'}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div className="text-micro font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {date}
              </div>
              <div className="space-y-2">
                {items.map(act => (
                  <div
                    key={`${act.activity_type}-${act.id}`}
                    className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex-shrink-0">
                        {activityIcon(act.activity_type, act.direction)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-700">
                            {activityLabel(act.activity_type, act.direction)}
                          </span>
                          <span className="text-micro text-gray-400 flex items-center gap-1 flex-shrink-0">
                            <Clock size={10} />
                            {formatTime(act.activity_date)}
                          </span>
                        </div>

                        {/* Subject line (for notes/emails) */}
                        {act.subject && (
                          <div className="text-xs font-medium text-gray-700 mt-1">{act.subject}</div>
                        )}

                        {/* Body/message */}
                        {act.body && !act.body.includes('* Body is hidden') && (
                          <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap line-clamp-4">
                            {act.body}
                          </div>
                        )}
                        {act.body?.includes('* Body is hidden') && (
                          <div className="text-xs text-gray-400 italic mt-1">Content hidden by FUB privacy</div>
                        )}

                        {/* Call-specific metadata */}
                        {act.activity_type === 'call' && (
                          <div className="flex items-center gap-3 mt-1.5">
                            {act.duration != null && act.duration > 0 && (
                              <span className="text-micro text-gray-500">
                                Duration: {formatDuration(act.duration)}
                              </span>
                            )}
                            {act.outcome && (
                              <span className="text-micro text-gray-500">
                                {act.outcome}
                              </span>
                            )}
                            {(act.from_number || act.to_number) && (
                              <span className="text-micro text-gray-400">
                                {act.direction === 'inbound' ? act.from_number : act.to_number}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Text delivery status */}
                        {act.activity_type === 'text' && act.status && (
                          <div className="mt-1">
                            <span className={cn(
                              'text-micro px-1.5 py-0.5 rounded',
                              act.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600' :
                              act.status === 'Failed' ? 'bg-red-50 text-red-600' :
                              'bg-gray-100 text-gray-500'
                            )}>
                              {act.status}
                            </span>
                          </div>
                        )}

                        {/* Created by */}
                        {act.created_by && (
                          <div className="text-micro text-gray-400 mt-1">by {act.created_by}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
