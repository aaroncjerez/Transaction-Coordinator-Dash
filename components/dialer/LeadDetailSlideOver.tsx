import React, { useState, useEffect, useCallback } from 'react';
import { X, Phone, MapPin, Copy, Check, Loader2, Ban, Clock, StickyNote, Trash2, RotateCcw, ChevronDown } from 'lucide-react';
import { CallCard } from './CallCard';
import { CadenceStageIndicator } from './CadenceStageIndicator';
import { CadenceTimeline } from './CadenceVisualization';
import { cn } from '../../lib/utils';
import { formatPhone } from '../../lib/utils/phone';
import {
  fetchDialerCallsForLead,
  fetchDialerLeadMemory,
  addDialerManualDNC,
  setDialerLeadOutcome,
  clearDialerLeadOutcome,
  setDialerLeadCallback,
  addDialerLeadNote,
  fetchDialerLeadNotes,
  deleteDialerLeadNote,
} from '../../lib/database';
import { useToast } from '../ui/Toast';

interface LeadDetailSlideOverProps {
  phoneNormalized: string;
  onClose: () => void;
  onCallLead?: (lead: any) => void;
  onLeadChanged?: () => void;
}

const OUTCOME_OPTIONS = [
  { value: 'Not Interested', label: 'Not Interested' },
  { value: 'Wrong Number', label: 'Wrong Number' },
  { value: 'No Answer', label: 'No Answer (Final)' },
  { value: 'Deal', label: 'Deal' },
  { value: 'DNC', label: 'Do Not Call' },
  { value: 'Other', label: 'Other' },
];

export const LeadDetailSlideOver: React.FC<LeadDetailSlideOverProps> = ({
  phoneNormalized,
  onClose,
  onCallLead,
  onLeadChanged,
}) => {
  const { showToast } = useToast();
  const [calls, setCalls] = useState<any[]>([]);
  const [memory, setMemory] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [showOutcomeMenu, setShowOutcomeMenu] = useState(false);
  const [showCallbackPicker, setShowCallbackPicker] = useState(false);
  const [callbackInput, setCallbackInput] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setCalls([]);
    setMemory(null);
    setNotes([]);
    try {
      const [callData, memoryData, noteData] = await Promise.all([
        fetchDialerCallsForLead(phoneNormalized),
        fetchDialerLeadMemory(phoneNormalized),
        fetchDialerLeadNotes(phoneNormalized),
      ]);
      setCalls(callData || []);
      setMemory(memoryData);
      setNotes(noteData || []);
    } catch (err) {
      console.error('Error loading lead data:', err);
    } finally {
      setLoading(false);
    }
  }, [phoneNormalized]);

  useEffect(() => { loadData(); }, [loadData]);

  const leadCache = calls[0]?.leads_cache;
  const leadName = leadCache
    ? [leadCache.first_name, leadCache.last_name].filter(Boolean).join(' ') || 'Unknown'
    : formatPhone(phoneNormalized);
  const leadLocation = leadCache
    ? [leadCache.county, leadCache.state].filter(Boolean).join(', ')
    : null;

  const rapportLevel = leadCache?.rapport_level;
  const headerAccent =
    rapportLevel === 'hot' ? 'border-t-orange-400' :
    rapportLevel === 'warm' ? 'border-t-amber-400' :
    rapportLevel === 'warming' ? 'border-t-yellow-400' :
    'border-t-gray-200';

  const copyPhone = () => {
    navigator.clipboard.writeText(phoneNormalized);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDNC = async () => {
    try {
      await addDialerManualDNC(phoneNormalized, 'Manual DNC from lead detail');
      await setDialerLeadOutcome(phoneNormalized, 'DNC', 'Manual DNC from lead detail');
      showToast({ message: `${leadName} added to DNC`, type: 'success' });
      onLeadChanged?.();
      loadData();
    } catch (err) {
      showToast({ message: 'Failed to add to DNC', type: 'error' });
    }
  };

  const handleOutcome = async (outcome: string) => {
    setShowOutcomeMenu(false);
    try {
      if (outcome === 'DNC') {
        await handleDNC();
        return;
      }
      await setDialerLeadOutcome(phoneNormalized, outcome);
      showToast({ message: `Outcome set: ${outcome}`, type: 'success' });
      onLeadChanged?.();
      loadData();
    } catch (err) {
      showToast({ message: 'Failed to set outcome', type: 'error' });
    }
  };

  const handleClearOutcome = async () => {
    try {
      await clearDialerLeadOutcome(phoneNormalized);
      showToast({ message: 'Outcome cleared — lead re-enabled', type: 'success' });
      onLeadChanged?.();
      loadData();
    } catch (err) {
      showToast({ message: 'Failed to clear outcome', type: 'error' });
    }
  };

  const handleSetCallback = async () => {
    if (!callbackInput) return;
    setShowCallbackPicker(false);
    try {
      await setDialerLeadCallback(phoneNormalized, callbackInput);
      showToast({ message: 'Callback scheduled', type: 'success' });
      setCallbackInput('');
      onLeadChanged?.();
      loadData();
    } catch (err) {
      showToast({ message: 'Failed to schedule callback', type: 'error' });
    }
  };

  const handleClearCallback = async () => {
    try {
      await setDialerLeadCallback(phoneNormalized, null);
      showToast({ message: 'Callback cleared', type: 'success' });
      onLeadChanged?.();
      loadData();
    } catch (err) {
      showToast({ message: 'Failed to clear callback', type: 'error' });
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    try {
      await addDialerLeadNote(phoneNormalized, newNote.trim());
      setNewNote('');
      const noteData = await fetchDialerLeadNotes(phoneNormalized);
      setNotes(noteData || []);
    } catch (err) {
      showToast({ message: 'Failed to add note', type: 'error' });
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteDialerLeadNote(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err) {
      showToast({ message: 'Failed to delete note', type: 'error' });
    }
  };

  return (
    <div className={cn('h-full flex flex-col bg-white border-t-[3px]', headerAccent)}>
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-gray-900 truncate tracking-tight">
            {loading ? 'Loading...' : leadName}
          </h3>
          <div className="flex items-center gap-3 mt-1">
            <button
              className="inline-flex items-center gap-1 text-caption font-mono text-blue-600 hover:text-blue-800 transition-colors"
              onClick={copyPhone}
            >
              <Phone size={12} />
              {formatPhone(phoneNormalized)}
              {copied
                ? <Check size={10} className="text-emerald-500" />
                : <Copy size={10} className="text-gray-400" />}
            </button>
            {leadLocation && (
              <span className="inline-flex items-center gap-1 text-micro text-gray-400">
                <MapPin size={10} /> {leadLocation}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
          {onCallLead && !loading && (
            <button
              onClick={() => onCallLead({ phone_normalized: phoneNormalized, ...leadCache })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-caption font-medium rounded-lg hover:bg-emerald-600 transition-colors shadow-sm"
            >
              <Phone size={12} /> Call
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Action Bar */}
      {!loading && (
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-100 bg-gray-50/50">
          {/* DNC Button */}
          <button
            onClick={handleDNC}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-micro font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
          >
            <Ban size={11} /> DNC
          </button>

          {/* Outcome Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowOutcomeMenu(!showOutcomeMenu)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-micro font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-md transition-colors"
            >
              {leadCache?.final_outcome || 'Set Outcome'} <ChevronDown size={10} />
            </button>
            {showOutcomeMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 py-1 min-w-[150px]">
                {OUTCOME_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleOutcome(opt.value)}
                    className="w-full text-left px-3 py-1.5 text-caption text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
                {leadCache?.final_outcome && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={() => { setShowOutcomeMenu(false); handleClearOutcome(); }}
                      className="w-full text-left px-3 py-1.5 text-caption text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1"
                    >
                      <RotateCcw size={10} /> Clear Outcome
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Callback Button */}
          <div className="relative">
            <button
              onClick={() => setShowCallbackPicker(!showCallbackPicker)}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1.5 text-micro font-medium rounded-md transition-colors',
                leadCache?.callback_requested
                  ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                  : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50'
              )}
            >
              <Clock size={11} />
              {leadCache?.callback_requested ? 'Callback Set' : 'Callback'}
            </button>
            {showCallbackPicker && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 p-3 min-w-[220px]">
                <input
                  type="datetime-local"
                  value={callbackInput}
                  onChange={e => setCallbackInput(e.target.value)}
                  className="w-full text-caption border border-gray-200 rounded-md px-2 py-1.5 mb-2"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSetCallback}
                    disabled={!callbackInput}
                    className="flex-1 px-2 py-1 text-micro font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md"
                  >
                    Set
                  </button>
                  {leadCache?.callback_requested && (
                    <button
                      onClick={() => { setShowCallbackPicker(false); handleClearCallback(); }}
                      className="px-2 py-1 text-micro text-gray-500 hover:text-gray-700"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-300">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Lead Stats */}
            {leadCache && (
              <div className="grid grid-cols-2 gap-2.5">
                {leadCache.cadence_stage != null && (
                  <StatCard label="Cadence">
                    <CadenceStageIndicator stage={leadCache.cadence_stage} />
                  </StatCard>
                )}
                {rapportLevel && (
                  <StatCard label="Rapport">
                    <span className={cn(
                      'px-1.5 py-0.5 rounded-full text-micro font-semibold',
                      rapportLevel === 'hot' ? 'bg-orange-100 text-orange-700' :
                      rapportLevel === 'warm' ? 'bg-amber-100 text-amber-700' :
                      rapportLevel === 'warming' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-500'
                    )}>
                      {rapportLevel}
                    </span>
                  </StatCard>
                )}
                {leadCache.attempt_count != null && (
                  <StatCard label="Attempts">
                    <span className="text-sm font-bold tabular-nums text-gray-900">
                      {leadCache.attempt_count}
                    </span>
                  </StatCard>
                )}
                {leadCache.market_value && (
                  <StatCard label="Market Value">
                    <span className="text-sm font-bold tabular-nums text-gray-900">
                      ${Number(leadCache.market_value).toLocaleString()}
                    </span>
                  </StatCard>
                )}
              </div>
            )}

            {/* Outcome Badge */}
            {leadCache?.final_outcome && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-caption text-amber-800 font-medium">
                  Outcome: {leadCache.final_outcome}
                  {leadCache.final_outcome_reason && (
                    <span className="text-amber-600 font-normal ml-1">— {leadCache.final_outcome_reason}</span>
                  )}
                </span>
              </div>
            )}

            {/* Cadence Timeline */}
            {leadCache?.cadence_stage != null && (
              <Section title="Cadence Progress">
                <div className="bg-gray-50 rounded-lg p-3">
                  <CadenceTimeline currentStage={leadCache.cadence_stage} />
                </div>
              </Section>
            )}


            {/* Notes */}
            <Section title={`Notes${notes.length > 0 ? ` (${notes.length})` : ''}`}>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                    placeholder="Add a note..."
                    className="flex-1 text-caption border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-blue-300"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim()}
                    className="px-2.5 py-1.5 text-micro font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors"
                  >
                    <StickyNote size={12} />
                  </button>
                </div>
                {notes.map(note => (
                  <div key={note.id} className="flex items-start gap-2 bg-gray-50 rounded-md px-2.5 py-2 group">
                    <p className="flex-1 text-caption text-gray-700">{note.note}</p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-micro text-gray-400">
                        {new Date(note.created_at).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Conversation Memory */}
            {memory && (
              <Section title="Conversation Memory">
                <div className="bg-gray-50 rounded-lg p-3 space-y-2.5">
                  {memory.summary && (
                    <p className="text-caption text-gray-700 leading-relaxed">{memory.summary}</p>
                  )}
                  {memory.key_facts?.length > 0 && (
                    <div>
                      <p className="text-micro text-gray-500 font-semibold mb-1">Key Facts</p>
                      <ul className="space-y-0.5">
                        {memory.key_facts.map((fact: string, i: number) => (
                          <li key={i} className="text-caption text-gray-600 flex items-start gap-1.5">
                            <span className="text-gray-300 mt-0.5">•</span>
                            <span>{fact}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {memory.next_action_strategy && (
                    <div>
                      <p className="text-micro text-gray-500 font-semibold mb-1">Next Action</p>
                      <p className="text-caption text-gray-700">{memory.next_action_strategy}</p>
                    </div>
                  )}
                  {memory.pricing_discussed && (
                    <div>
                      <p className="text-micro text-gray-500 font-semibold mb-1">Pricing</p>
                      <p className="text-caption text-gray-700">{memory.pricing_discussed}</p>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Call History */}
            <Section title={`Call History${calls.length > 0 ? ` (${calls.length})` : ''}`}>
              {calls.length === 0 ? (
                <p className="text-caption text-gray-400 py-6 text-center">No calls yet</p>
              ) : (
                <div className="space-y-2">
                  {calls.map((call: any) => (
                    <CallCard key={call.id} call={call} showSummaryFirst />
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="bg-gray-50 rounded-lg p-2.5">
    <p className="text-micro text-gray-400 font-medium mb-1">{label}</p>
    {children}
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h4 className="text-caption font-semibold text-gray-700 mb-2">{title}</h4>
    {children}
  </div>
);
