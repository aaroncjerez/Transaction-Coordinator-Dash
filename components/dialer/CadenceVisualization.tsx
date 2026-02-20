import React, { useState, useEffect } from 'react';
import { Calendar, Zap, Loader2, Clock } from 'lucide-react';
import { fetchLocalDialerCallQueue } from '../../lib/database';
import { cn } from '../../lib/utils';
import { CADENCE_DAY_SEQUENCE, CADENCE_TOTAL_STAGES } from '../../types';

interface CadenceTimelineProps {
  currentStage: number | null;
  startDate?: string;
}

const CadenceTimeline: React.FC<CadenceTimelineProps> = ({ currentStage, startDate }) => {
  const stage = currentStage ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-8 overflow-x-auto pb-2">
        {CADENCE_DAY_SEQUENCE.map((day, idx) => {
          const isCompleted = idx < stage;
          const isCurrent = idx === stage;
          const isFuture = idx > stage;

          // Calculate projected date if startDate available
          let dateLabel: string | undefined;
          if (startDate) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + day - 1);
            dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }

          return (
            <div key={idx} className="flex flex-col items-center min-w-[3rem]">
              {/* Stage circle */}
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-micro font-bold border-2 transition-all',
                  isCompleted && 'bg-green-500 border-green-500 text-white',
                  isCurrent && 'bg-blue-500 border-blue-500 text-white ring-2 ring-blue-200 ring-offset-1',
                  isFuture && 'bg-white border-gray-200 text-gray-400',
                )}
              >
                {idx + 1}
              </div>

              {/* Day label */}
              <span className={cn(
                'text-micro mt-1 font-medium',
                isCompleted && 'text-green-600',
                isCurrent && 'text-blue-600',
                isFuture && 'text-gray-400',
              )}>
                Day {day}
              </span>

              {/* Date projection */}
              {dateLabel && (
                <span className="text-micro text-gray-400">{dateLabel}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-gradient-to-r from-green-500 via-blue-500 to-blue-400 h-full rounded-full transition-all duration-700"
          style={{ width: `${(stage / CADENCE_TOTAL_STAGES) * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-micro text-gray-400">
        <span>Stage {stage}/{CADENCE_TOTAL_STAGES}</span>
        <span>{CADENCE_TOTAL_STAGES - stage} calls remaining</span>
      </div>
    </div>
  );
};

export const CadenceVisualization: React.FC = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const queue = await fetchLocalDialerCallQueue(500);
        // Filter to leads with active cadence
        const cadenceLeads = (queue || []).filter((l: any) => l.cadence_stage != null && l.cadence_stage > 0);
        setLeads(cadenceLeads);
      } catch (err) {
        console.error('Error loading cadence data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // Group leads by cadence stage
  const stageCounts: Record<number, number> = {};
  for (const lead of leads) {
    const s = lead.cadence_stage ?? 0;
    stageCounts[s] = (stageCounts[s] || 0) + 1;
  }

  // Leads due today
  const today = new Date().toISOString().slice(0, 10);
  const dueToday = leads.filter(l => l.next_call_date && l.next_call_date.slice(0, 10) <= today);

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={14} className="text-blue-500" />
            <span className="text-micro font-semibold text-gray-500 uppercase tracking-wider">Active Cadences</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{leads.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={14} className="text-green-500" />
            <span className="text-micro font-semibold text-gray-500 uppercase tracking-wider">Due Today</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{dueToday.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-amber-500" />
            <span className="text-micro font-semibold text-gray-500 uppercase tracking-wider">Avg Stage</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {leads.length > 0
              ? (leads.reduce((sum, l) => sum + (l.cadence_stage ?? 0), 0) / leads.length).toFixed(1)
              : '0'}
          </div>
        </div>
      </div>

      {/* 14-stage pipeline visualization */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Cadence Pipeline (14 stages / 6 weeks)</h3>
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
          {CADENCE_DAY_SEQUENCE.map((day, idx) => {
            const count = stageCounts[idx + 1] || 0;
            const maxCount = Math.max(...Object.values(stageCounts), 1);
            const heightPct = Math.max((count / maxCount) * 100, 8);

            return (
              <div key={idx} className="flex flex-col items-center gap-1">
                <span className="text-micro font-bold text-gray-700 tabular-nums">{count}</span>
                <div className="w-full bg-gray-100 rounded-sm relative" style={{ height: '60px' }}>
                  <div
                    className={cn(
                      'absolute bottom-0 left-0 right-0 rounded-sm transition-all',
                      idx < 4 ? 'bg-green-400' : idx < 8 ? 'bg-blue-400' : idx < 11 ? 'bg-amber-400' : 'bg-red-400',
                    )}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className="text-micro text-gray-400">D{day}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leads due today list */}
      {dueToday.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Due Today ({dueToday.length})</h3>
          <div className="space-y-2">
            {dueToday.slice(0, 20).map(lead => (
              <div key={lead.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div>
                  <span className="text-caption font-medium text-gray-800">
                    {lead.first_name || ''} {lead.last_name || ''}
                  </span>
                  <span className="text-micro text-gray-400 ml-2">
                    {lead.county && `${lead.county}, `}{lead.state || ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-micro text-gray-500">Stage {lead.cadence_stage}/{CADENCE_TOTAL_STAGES}</span>
                  <span className={cn(
                    'text-micro px-1.5 py-0.5 rounded font-medium',
                    lead.rapport_level === 'hot' ? 'bg-red-100 text-red-700' :
                    lead.rapport_level === 'warm' ? 'bg-amber-100 text-amber-700' :
                    lead.rapport_level === 'warming' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-500'
                  )}>
                    {lead.rapport_level || 'cold'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Example timeline */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Cadence Timeline Example</h3>
        <CadenceTimeline currentStage={5} startDate={new Date().toISOString()} />
      </div>
    </div>
  );
};

export { CadenceTimeline };
