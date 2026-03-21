import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, User, Bot, FileText, Loader2 } from 'lucide-react';
import { askAI, saveChatMessage, getChatMessages } from '../lib/database';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';

interface DealChatProps {
  dealId: string;
  dealName: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ file_name: string; chunk_index: number }>;
  created_at?: string;
}

const SUGGESTED_QUESTIONS = [
  "What's the closing date?",
  "Are there any contingencies?",
  "What are the key deadlines?",
  "Summarize the contract terms",
];

export const DealChat: React.FC<DealChatProps> = ({ dealId, dealName }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load persisted messages
  useEffect(() => {
    if (!dealId) return;
    (async () => {
      try {
        const saved = await getChatMessages(dealId);
        if (saved && saved.length > 0) {
          setMessages(saved.map((m: any) => ({
            id: m.id.toString(),
            role: m.role,
            content: m.content,
            sources: m.sources ? (() => { try { return JSON.parse(m.sources); } catch { return undefined; } })() : undefined,
            created_at: m.created_at,
          })));
        }
      } catch (e) {
        console.error('[DealChat] Failed to load messages:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [dealId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isTyping) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    // Persist user message
    saveChatMessage(dealId, 'user', userMsg.content).catch(e =>
      console.error('[DealChat] Failed to save user message:', e)
    );

    try {
      const result = await askAI(content.trim(), dealId);
      const aiContent = result?.answer || "I couldn't process your request.";
      const sources = result?.sources || [];

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: aiContent,
        sources: sources.length > 0 ? sources : undefined,
      };

      setMessages(prev => [...prev, aiMsg]);

      // Persist AI message
      saveChatMessage(dealId, 'assistant', aiContent, sources.length > 0 ? JSON.stringify(sources) : undefined).catch(e =>
        console.error('[DealChat] Failed to save AI message:', e)
      );
    } catch (error) {
      console.error('[DealChat] Error:', error);
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'I encountered an error. Please try again.',
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleSuggestionClick = (question: string) => {
    sendMessage(question);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400 text-caption">
        <Loader2 size={14} className="animate-spin mr-2" /> Loading chat...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && !isTyping && (
          <div className="text-center py-6 space-y-3">
            <div className="flex items-center justify-center gap-1.5 text-gray-400">
              <Sparkles size={14} />
              <span className="text-caption font-medium">Deal Assistant</span>
            </div>
            <p className="text-micro text-gray-400">
              Ask questions about the documents in this deal
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 pt-2">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(q)}
                  className="text-micro px-2.5 py-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-primary hover:text-primary transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : '')}>
            <div className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
              msg.role === 'user' ? 'bg-gray-100' : 'bg-blue-50'
            )}>
              {msg.role === 'user'
                ? <User size={12} className="text-gray-500" />
                : <Bot size={12} className="text-blue-600" />}
            </div>
            <div className={cn(
              'max-w-[85%] rounded-lg px-3 py-2 text-caption leading-relaxed',
              msg.role === 'user'
                ? 'bg-gray-100 text-gray-800'
                : 'bg-blue-50/70 text-gray-700 border border-blue-100/50'
            )}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-gray max-w-none [&_p]:mb-1.5 [&_p]:last:mb-0 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:text-gray-800">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p>{msg.content}</p>
              )}

              {/* Source citations */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-blue-100/50 flex flex-wrap gap-1">
                  {[...new Set(msg.sources.map(s => s.file_name))].map((fileName, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-micro text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"
                    >
                      <FileText size={9} />
                      {fileName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Bot size={12} className="text-blue-600" />
            </div>
            <div className="bg-blue-50/70 rounded-lg border border-blue-100/50 px-3 py-2 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested questions (show when there are messages but not typing) */}
      {messages.length > 0 && !isTyping && (
        <div className="px-3 py-1.5 flex gap-1 overflow-x-auto border-t border-gray-100">
          {SUGGESTED_QUESTIONS.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSuggestionClick(q)}
              className="text-micro px-2 py-1 rounded-full border border-gray-100 text-gray-400 hover:border-primary hover:text-primary transition-colors whitespace-nowrap flex-shrink-0"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="px-3 py-2 border-t border-gray-200 bg-white">
        <form onSubmit={handleSubmit} className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about this deal..."
            className="w-full pl-3 pr-10 py-2 text-caption bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isTyping}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={12} />
          </button>
        </form>
      </div>
    </div>
  );
};
