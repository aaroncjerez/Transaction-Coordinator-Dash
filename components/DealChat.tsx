import React, { useState } from 'react';
import { Send, Sparkles, User, Bot } from 'lucide-react';
import { askAI } from '../lib/database';

interface DealChatProps {
    dealId: string;
    dealName: string;
}

interface Message {
    id: string;
    sender: 'user' | 'ai';
    content: string;
    timestamp: Date;
}

export const DealChat: React.FC<DealChatProps> = ({ dealId, dealName }) => {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            sender: 'ai',
            content: `Hello! I've analyzed the documents for **${dealName}**. Ask me about dates, contingencies, or specific clauses.`,
            timestamp: new Date()
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            sender: 'user',
            content: inputValue,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsTyping(true);

        try {
            const result = await askAI(userMsg.content, dealId);

            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'ai',
                content: result?.answer || "I apologize, but I couldn't process your request.",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, aiMsg]);
        } catch (error) {
            console.error('Chat Error:', error);
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'ai',
                content: "I encountered an error connecting to the intelligence server. Please try again.",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <div className="flex flex-col h-[600px] border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                <Sparkles className="text-blue-600" size={18} />
                <h3 className="font-semibold text-gray-800">Deal Assistant</h3>
                <span className="text-xs text-gray-500 ml-auto">Powered by Claude</span>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.sender === 'user' ? 'bg-gray-200' : 'bg-blue-100'}`}>
                            {msg.sender === 'user' ? <User size={16} className="text-gray-600" /> : <Bot size={16} className="text-blue-600" />}
                        </div>
                        <div className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed ${msg.sender === 'user'
                            ? 'bg-gray-100 text-gray-900 rounded-tr-none'
                            : 'bg-blue-50 text-gray-800 rounded-tl-none border border-blue-100'
                            }`}>
                            {msg.sender === 'ai' ? (
                                <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br/>') }} />
                            ) : (
                                msg.content
                            )}
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <Bot size={16} className="text-blue-600" />
                        </div>
                        <div className="bg-blue-50 rounded-2xl rounded-tl-none border border-blue-100 p-4 flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-gray-100 bg-white">
                <form onSubmit={handleSendMessage} className="relative">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Ask about this deal..."
                        className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    <button
                        type="submit"
                        disabled={!inputValue.trim() || isTyping}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send size={16} />
                    </button>
                </form>
            </div>
        </div>
    );
};
