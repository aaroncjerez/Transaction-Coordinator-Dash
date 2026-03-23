import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal, Send, Loader2 } from 'lucide-react';
import { askCfoQuestion } from '../../lib/database';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Props {
  context: {
    totalBalance: number;
    monthlyBurn: number;
    runway: number;
    last30DaysIn: number;
    last30DaysOut: number;
    activeDealsCount: number;
    closedDealsCount: number;
    pipelineProfit: number;
    closedProfit: number;
    dealsList: string;
  };
}

export const CfoCli: React.FC<Props> = ({ context }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = useCallback(async () => {
    const question = input.trim();
    if (!question || isLoading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      const { answer } = await askCfoQuestion(question, context);
      setMessages(prev => [...prev, { role: 'assistant', content: answer, timestamp: new Date() }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to get response'}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, context]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#30363d] flex items-center gap-2">
        <Terminal size={13} className="text-emerald-400" />
        <span className="text-xs font-semibold text-white">Ask your CFO</span>
        <span className="text-[10px] text-slate-600 ml-auto">Claude · Financial context attached</span>
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div ref={scrollRef} className="max-h-[300px] overflow-y-auto p-3 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? '' : ''}`}>
              <div className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold mt-0.5 ${
                msg.role === 'user'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {msg.role === 'user' ? 'AJ' : 'AI'}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user' ? 'text-slate-300' : 'text-slate-200'
                }`}>
                  {msg.content}
                </p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-2">
              <div className="w-5 h-5 rounded bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Loader2 size={10} className="text-emerald-400 animate-spin" />
              </div>
              <p className="text-xs text-slate-500">Thinking...</p>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="p-2 border-t border-[#30363d] flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about cash flow, deals, burn rate, runway..."
          className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 font-mono"
          disabled={isLoading}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="p-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
};
