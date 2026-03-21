import React, { useEffect, useState, useRef } from 'react';
import { StickyNote, Send, Cloud, Loader2 } from 'lucide-react';
import { createDealNote, listDealNotes } from '../../lib/database';
import { cn } from '../../lib/utils';

interface DealNotesProps {
  dealId: string;
  fubPersonId?: string;
}

interface NoteItem {
  id: number;
  deal_id: string;
  content: string;
  pushed_to_fub: number;
  created_at: string;
}

export const DealNotes: React.FC<DealNotesProps> = ({ dealId, fubPersonId }) => {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [pushToFub, setPushToFub] = useState(!!fubPersonId);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchNotes = async () => {
    try {
      const data = await listDealNotes(dealId);
      setNotes(data || []);
    } catch (e) {
      console.error('[DealNotes] Failed to fetch notes:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dealId) fetchNotes();
  }, [dealId]);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      await createDealNote(dealId, trimmed, pushToFub);
      setContent('');
      await fetchNotes();
      textareaRef.current?.focus();
    } catch (e) {
      console.error('[DealNotes] Failed to create note:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'Z');
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-3">
      {/* Compose */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a note..."
          rows={2}
          className="w-full px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 resize-none focus:outline-none"
        />
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            {fubPersonId && (
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pushToFub}
                  onChange={e => setPushToFub(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Cloud size={11} className="text-blue-400" />
                <span className="text-micro text-gray-500">Push to FUB</span>
              </label>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded text-micro font-medium transition-colors',
              content.trim()
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            )}
          >
            {submitting ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Send size={11} />
            )}
            Add Note
          </button>
        </div>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="text-center text-gray-400 text-caption py-4">Loading notes...</div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6 text-gray-400">
          <StickyNote size={20} />
          <p className="text-caption">No notes yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(note => (
            <div key={note.id} className="bg-white rounded-lg border border-gray-100 px-3 py-2.5">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-micro text-gray-400">{formatDate(note.created_at)}</span>
                {note.pushed_to_fub === 1 && (
                  <span className="inline-flex items-center gap-1 text-micro text-blue-500">
                    <Cloud size={9} /> FUB
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
