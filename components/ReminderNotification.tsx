import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, ExternalLink } from 'lucide-react';
import { onReminderFired } from '../lib/database';

interface FiredReminder {
  reminderId: string;
  taskId: string;
  taskTitle: string;
  dealId: string | null;
  dealName: string | null;
  remindAt: string;
  slackSent: boolean;
}

/**
 * Global in-app notification banner for fired task reminders.
 * Listens for 'reminder:fired' IPC events and shows persistent
 * notifications in the top-right corner with a "View Deal" action.
 */
export const ReminderNotification: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<FiredReminder[]>([]);

  useEffect(() => {
    onReminderFired((data: FiredReminder) => {
      setNotifications(prev => [data, ...prev]);
    });
  }, []);

  const dismiss = useCallback((reminderId: string) => {
    setNotifications(prev => prev.filter(n => n.reminderId !== reminderId));
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const handleViewDeal = useCallback((dealId: string, reminderId: string) => {
    dismiss(reminderId);
    // Navigate to pipeline with deal query param — Pipeline reads ?deal= to auto-open modal
    navigate(`/pipeline?deal=${dealId}`);
  }, [navigate, dismiss]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      {notifications.length > 1 && (
        <button
          onClick={dismissAll}
          className="self-end text-micro text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded bg-white/80 backdrop-blur-sm border border-gray-200 shadow-xs"
        >
          Dismiss all ({notifications.length})
        </button>
      )}
      {notifications.map((n) => (
        <div
          key={n.reminderId}
          className="bg-white border border-amber-200 rounded-lg shadow-md p-3 animate-slide-in-up"
        >
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bell size={14} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {n.taskTitle}
              </p>
              {n.dealName && (
                <p className="text-caption text-gray-500 truncate">
                  {n.dealName}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                {n.dealId && (
                  <button
                    onClick={() => handleViewDeal(n.dealId!, n.reminderId)}
                    className="text-micro font-medium text-primary hover:text-primary/80 flex items-center gap-0.5"
                  >
                    <ExternalLink size={10} /> View Deal
                  </button>
                )}
                {n.slackSent && (
                  <span className="text-micro text-gray-400 flex items-center gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-emerald-500" />
                    Slack sent
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => dismiss(n.reminderId)}
              className="text-gray-400 hover:text-gray-600 p-0.5 flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
