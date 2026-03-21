import React, { useState, useEffect, useCallback } from 'react';
import { Phone, Loader2, List } from 'lucide-react';
import { fetchDialerLists } from '../../lib/database';
import { cn } from '../../lib/utils';

interface DialerList {
  id: string;
  name: string;
  lead_count: number;
  actual_lead_count: number;
  created_at: string;
}

interface ListStripProps {
  selectedListIds: string[];
  onSelectionChange: (listIds: string[]) => void;
  onDialList: (listIds: string[]) => void;
  dialing: boolean;
}

export const ListStrip: React.FC<ListStripProps> = ({
  selectedListIds,
  onSelectionChange,
  onDialList,
  dialing,
}) => {
  const [lists, setLists] = useState<DialerList[]>([]);

  const loadLists = useCallback(async () => {
    try {
      const data = await fetchDialerLists();
      setLists(data);
    } catch (err) {
      console.error('Error loading dialer lists:', err);
    }
  }, []);

  useEffect(() => { loadLists(); }, [loadLists]);

  if (lists.length === 0) return null;

  const allSelected = selectedListIds.length === 0;

  const toggle = (listId: string) => {
    if (selectedListIds.includes(listId)) {
      onSelectionChange(selectedListIds.filter(id => id !== listId));
    } else {
      onSelectionChange([...selectedListIds, listId]);
    }
  };

  const totalLeads = allSelected
    ? 0
    : lists
        .filter(l => selectedListIds.includes(l.id))
        .reduce((sum, l) => sum + (l.actual_lead_count || l.lead_count), 0);

  return (
    <div className="flex items-center gap-2">
      {/* List pills — scrollable */}
      <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0">
        <List size={14} className="text-gray-400 flex-shrink-0" />

        {/* "All" pill */}
        <button
          onClick={() => onSelectionChange([])}
          className={cn(
            'px-2.5 py-1 rounded-full text-micro font-medium whitespace-nowrap border transition-colors flex-shrink-0',
            allSelected
              ? 'bg-gray-800 text-white border-gray-800'
              : 'text-gray-500 border-gray-200 hover:bg-gray-100'
          )}
        >
          All
        </button>

        {lists.map(list => {
          const selected = selectedListIds.includes(list.id);
          const count = list.actual_lead_count || list.lead_count;
          return (
            <button
              key={list.id}
              onClick={() => toggle(list.id)}
              className={cn(
                'px-2.5 py-1 rounded-full text-micro font-medium whitespace-nowrap border transition-colors flex-shrink-0',
                selected
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'text-gray-600 border-gray-200 hover:bg-gray-100'
              )}
            >
              {list.name}
              <span className={cn(
                'ml-1 tabular-nums',
                selected ? 'text-blue-200' : 'text-gray-400'
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Dial button — only when lists selected */}
      {!allSelected && totalLeads > 0 && (
        <button
          onClick={() => onDialList(selectedListIds)}
          disabled={dialing}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-caption font-semibold whitespace-nowrap transition-colors flex-shrink-0',
            dialing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm'
          )}
        >
          {dialing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Phone size={13} />
          )}
          {dialing ? 'Dialing...' : `Dial ${totalLeads > 50 ? '50' : totalLeads} Leads`}
        </button>
      )}
    </div>
  );
};
