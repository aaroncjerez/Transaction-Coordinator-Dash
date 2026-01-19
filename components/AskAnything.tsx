import React, { useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';

export const AskAnything: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [response, setResponse] = useState<string | null>(null);
    const [isTyping, setIsTyping] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        // Simulate AI Processing
        setIsTyping(true);
        setResponse(null);

        // Mock Response Delay
        setTimeout(() => {
            setIsTyping(false);
            setResponse("Based on the Purchase Agreement for Smith - Fulton, the inspection period ends on **January 20th, 2025**. \n\nThere is a special stipulation regarding the roof repair credit of $1,500.");
        }, 1500);
    };

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50">
            {/* Response Card */}
            {response && (
                <div className="bg-white rounded-xl shadow-xl border border-blue-100 p-6 mb-4 animate-in slide-in-from-bottom-5">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm">
                            <Sparkles size={16} />
                            <span>TC-Engine AI</span>
                        </div>
                        <button onClick={() => setResponse(null)} className="text-gray-400 hover:text-gray-600">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
                        {response}
                    </div>
                </div>
            )}

            {/* Input Bar */}
            <div className={`bg-white rounded-2xl shadow-2xl border transition-all duration-300 ${isTyping ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'}`}>
                <form onSubmit={handleSubmit} className="relative flex items-center p-2">
                    <div className="pl-4 text-blue-600">
                        <Sparkles size={20} />
                    </div>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Ask anything about your deals... (e.g. 'When is the inspection deadline for Smith?')"
                        className="w-full px-4 py-3 bg-transparent outline-none text-gray-800 placeholder-gray-400"
                    />
                    <button
                        type="submit"
                        disabled={!query.trim() || isTyping}
                        className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isTyping ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Send size={18} />
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};
