import React, { useEffect, useState } from 'react';
import { Plus, Trash2, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { getDeadlinesByDeal, createDeadline, deleteDeadline, acknowledgeDeadline } from '../../lib/database';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

interface DealDeadlinesProps {
  dealId: string;
}

export const DealDeadlines: React.FC<DealDeadlinesProps> = ({ dealId }) => {
  const [deadlines, setDeadlines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDate, setNewDate] = useState('');

  const fetchDeadlines = async () => {
    try {
      const data = await getDeadlinesByDeal(dealId);
      setDeadlines((data || []).sort((a: any, b: any) =>
        new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      ));
    } catch (err) {
      console.error('Failed to fetch deadlines:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dealId) fetchDeadlines();
  }, [dealId]);

  const handleAdd = async () => {
    if (!newLabel.trim() || !newDate) return;
    try {
      await createDeadline({ deal_id: dealId, label: newLabel.trim(), due_date: newDate });
      setNewLabel('');
      setNewDate('');
      setIsAdding(false);
      fetchDeadlines();
    } catch (err) {
      console.error('Failed to create deadline:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDeadline(id);
      fetchDeadlines();
    } catch (err) {
      console.error('Failed to delete deadline:', err);
    }
  };

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeDeadline(id);
      fetchDeadlines();
    } catch (err) {
      console.error('Failed to acknowledge deadline:', err);
    }
  };

  const getUrgency = (dueDate: string, isAcknowledged: boolean) => {
    if (isAcknowledged) return 'acknowledged';
    const daysUntil = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
    if (daysUntil < 0) return 'overdue';
    if (daysUntil <= 1) return 'critical';
    if (daysUntil <= 7) return 'warning';
    return 'normal';
  };

  const urgencyStyles: Record<string, string> = {
    overdue: 'bg-red-50 border-red-200 text-red-700',
    critical: 'bg-red-50 border-red-200 text-red-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    normal: 'bg-white border-gray-200 text-gray-700',
    acknowledged: 'bg-gray-50 border-gray-200 text-gray-400',
  };

  const urgencyIcon: Record<string, React.ReactNode> = {
    overdue: <AlertTriangle size={14} className="text-red-500" />,
    critical: <AlertTriangle size={14} className="text-red-500" />,
    warning: <Clock size={14} className="text-amber-500" />,
    normal: <Clock size={14} className="text-gray-400" />,
    acknowledged: <CheckCircle size={14} className="text-gray-400" />,
  };

  if (loading) return <div className="py-8 text-center text-gray-400 text-caption">Loading deadlines...</div>;

  return (
    <div className="space-y-3 py-1">
      {/* Deadline List */}
      {deadlines.length === 0 && !isAdding && (
        <div className="py-8 text-center text-gray-400 text-caption italic">No deadlines set.</div>
      )}

      {deadlines.map(d => {
        const urgency = getUrgency(d.due_date, d.is_acknowledged);
        const daysUntil = Math.ceil((new Date(d.due_date).getTime() - Date.now()) / 86400000);
        return (
          <div
            key={d.id}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-md border transition-all',
              urgencyStyles[urgency]
            )}
          >
            {urgencyIcon[urgency]}
            <div className="flex-1 min-w-0">
              <span className={cn('text-sm font-medium', urgency === 'acknowledged' && 'line-through')}>
                {d.label}
              </span>
              <span className="text-caption text-gray-400 ml-2">
                {new Date(d.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {urgency !== 'acknowledged' && (
                  <span className="ml-1">
                    ({daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? 'today' : `${daysUntil}d`})
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {!d.is_acknowledged && (
                <button
                  onClick={() => handleAcknowledge(d.id)}
                  className="p-1 text-gray-400 hover:text-emerald-600 transition-colors"
                  title="Mark as acknowledged"
                >
                  <CheckCircle size={14} />
                </button>
              )}
              <button
                onClick={() => handleDelete(d.id)}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                title="Delete deadline"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}

      {/* Add New Deadline */}
      {isAdding ? (
        <div className="bg-subtle border border-gray-200 rounded-md p-3 space-y-2">
          <input
            type="text"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Deadline label (e.g., Contract expiration)"
            className="w-full bg-white border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            autoFocus
          />
          <input
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setIsAdding(false); setNewLabel(''); setNewDate(''); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!newLabel.trim() || !newDate}>
              Add
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1.5 text-caption text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <Plus size={14} />
          Add deadline
        </button>
      )}
    </div>
  );
};
