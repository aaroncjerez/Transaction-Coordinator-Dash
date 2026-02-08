import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, Clock, AlertTriangle, Check } from 'lucide-react';
import { getUpcomingDeadlines, acknowledgeDeadline, onDeadlineAlert } from '../lib/database';
import { useNavigate } from 'react-router-dom';

interface DeadlineAlert {
  id: string;
  deal_id: string;
  deal_name?: string;
  label: string;
  due_date: string;
  is_acknowledged: boolean;
  alert_schedule: any[];
}

export const NotificationCenter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [deadlines, setDeadlines] = useState<DeadlineAlert[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const fetchDeadlines = useCallback(async () => {
    try {
      const upcoming = await getUpcomingDeadlines(30);
      setDeadlines(upcoming);
    } catch (e) {
      console.error('Failed to fetch deadlines:', e);
    }
  }, []);

  useEffect(() => {
    fetchDeadlines();

    // Listen for real-time deadline alerts from main process
    onDeadlineAlert((data) => {
      setLiveAlerts(prev => [data, ...prev].slice(0, 10));
      fetchDeadlines();
    });

    // Refresh every 5 minutes
    const interval = setInterval(fetchDeadlines, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchDeadlines]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeDeadline(id);
      setDeadlines(prev => prev.filter(d => d.id !== id));
      setLiveAlerts(prev => prev.filter(a => a.deadlineId !== id));
    } catch (e) {
      console.error('Failed to acknowledge deadline:', e);
    }
  };

  const handleNavigate = (dealId: string) => {
    setIsOpen(false);
    navigate(`/deals/${dealId}`);
  };

  const unacknowledgedCount = deadlines.length + liveAlerts.length;

  const getDaysUntil = (dueDate: string): string => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return `${diffDays}d`;
  };

  const getUrgencyColor = (dueDate: string): string => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'text-red-600 bg-red-50';
    if (diffDays <= 3) return 'text-orange-600 bg-orange-50';
    if (diffDays <= 7) return 'text-yellow-600 bg-yellow-50';
    return 'text-blue-600 bg-blue-50';
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        title="Deadline Alerts"
        aria-label="Deadline Alerts"
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {unacknowledgedCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unacknowledgedCount > 9 ? '9+' : unacknowledgedCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Upcoming Deadlines</h3>
            <span className="text-xs text-gray-500">{deadlines.length} active</span>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {deadlines.length === 0 && liveAlerts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No upcoming deadlines
              </div>
            ) : (
              <>
                {/* Live alerts (just fired) */}
                {liveAlerts.map((alert, i) => (
                  <div key={`live-${i}`} className="px-4 py-3 border-b border-gray-50 bg-red-50/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900 truncate">{alert.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Due {getDaysUntil(alert.dueDate)} &middot; {alert.daysLeft <= 0 ? 'OVERDUE' : `${alert.daysLeft}d left`}
                        </p>
                      </div>
                      <button
                        onClick={() => handleNavigate(alert.dealId)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))}

                {/* Upcoming deadlines */}
                {deadlines.map(deadline => (
                  <div key={deadline.id} className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getUrgencyColor(deadline.due_date)}`}>
                            {getDaysUntil(deadline.due_date)}
                          </span>
                          <span className="text-sm font-medium text-gray-900 truncate">{deadline.label}</span>
                        </div>
                        {deadline.deal_name && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{deadline.deal_name}</p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-0.5">{new Date(deadline.due_date).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleNavigate(deadline.deal_id)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleAcknowledge(deadline.id)}
                          className="p-1 rounded hover:bg-gray-200 transition-colors"
                          title="Dismiss"
                        >
                          <Check className="h-3.5 w-3.5 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
