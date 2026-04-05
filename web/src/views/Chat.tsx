import React from 'react';
import { Send, Plus, Search, MessageSquare, Trash2, MoreVertical, User, Bot, Sparkles, ChevronRight, Settings2, Paperclip, Zap, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from "react-i18next";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
}



const models = [
  'Claude 3.5 Sonnet',
  'GPT-4o',
  'Llama 3.1 405B',
  'Gemini Pro 1.5',
  'DeepSeek Chat'
];

export default function ChatView() {
    const { t } = useTranslation();
  const [input, setInput] = React.useState('');
  
  const initialSessions: ChatSession[] = [
    { id: '1', title: 'Rust Backend Optimization', lastMessage: 'How can I optimize Axum...', timestamp: t('pricingtable.m_ago', { minutes: 2 }) },
    { id: '2', title: 'OpenHub Architecture', lastMessage: 'The management layer should...', timestamp: t('pricingtable.h_ago', { hours: 1 }) },
    { id: '3', title: 'Tailwind 4 Features', lastMessage: 'What are the main changes...', timestamp: t('chat.yesterday') },
  ];

  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: t('chat.assistant_greeting'),
      timestamp: '10:00 AM'
    }
  ]);
  const [sessions, setSessions] = React.useState(initialSessions);
  const [activeSessionId, setActiveSessionId] = React.useState('1');
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [selectedModel, setSelectedModel] = React.useState(models[0]);

  const handleSend = () => {
    if (!input.trim()) return;
    
    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages([...messages, newUserMessage]);
    setInput('');

    // Mock assistant response
    setTimeout(() => {
      const assistantResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t('chat.mock_response', { model: selectedModel }),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, assistantResponse]);
    }, 1000);
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-gray-50 flex flex-col bg-gray-50/30"
          >
            <div className="p-4 border-b border-gray-50 flex flex-col gap-4">
              <button 
                onClick={() => {
                  setMessages([{ id: '1', role: 'assistant', content: t('chat.new_chat_started'), timestamp: t('chat.just_now') }]);
                  setActiveSessionId(Math.random().toString());
                }}
                className="flex items-center justify-center gap-2 w-full bg-black text-white py-2.5 rounded-xl font-bold text-sm hover:bg-zinc-800 transition-all active:scale-95 shadow-lg shadow-black/5"
              >
                <Plus size={18} />
                {t('chat.new_chat')}</button>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
                <input 
                  type="text" 
                  placeholder={t('chat.placeholder_search')}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-4 focus:ring-black/5 transition-all"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl transition-all group relative",
                    activeSessionId === session.id 
                      ? "bg-white shadow-sm border border-zinc-100" 
                      : "hover:bg-gray-100/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      activeSessionId === session.id ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-500"
                    )}>
                      <MessageSquare size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={cn(
                        "text-xs font-bold truncate",
                        activeSessionId === session.id ? "text-zinc-900" : "text-zinc-600"
                      )}>{session.title}</h4>
                      <p className="text-[10px] text-zinc-400 truncate mt-0.5">{session.lastMessage}</p>
                    </div>
                    <span className="text-[9px] font-bold text-zinc-300 uppercase shrink-0">{session.timestamp}</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white relative">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg text-zinc-400 transition-colors"
            >
              <ChevronRight className={cn("transition-transform duration-300", isSidebarOpen && "rotate-180")} size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-900 border border-zinc-200">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm">{t('chat.openhub_assistant')}</h3>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{t('chat.system_online')}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative group/model">
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-full text-xs font-bold hover:border-black transition-all">
                <Zap size={14} className="text-yellow-500" />
                {selectedModel}
              </button>
              <div className="absolute right-0 mt-2 w-56 bg-white border border-zinc-100 rounded-xl shadow-xl opacity-0 invisible group-hover/model:opacity-100 group-hover/model:visible transition-all py-1 z-50">
                {models.map(m => (
                  <button 
                    key={m}
                    onClick={() => setSelectedModel(m)}
                    className={cn(
                      "w-full text-left px-4 py-2 text-xs font-bold transition-colors",
                      selectedModel === m ? "bg-zinc-50 text-black" : "text-zinc-500 hover:bg-zinc-50 hover:text-black"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-gray-100 rounded-lg text-zinc-400 transition-colors">
                <Settings2 size={20} />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg text-zinc-400 transition-colors">
                <MoreVertical size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth">
          {messages.map((message) => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={message.id} 
              className={cn(
                "flex gap-4 max-w-3xl mx-auto w-full",
                message.role === 'user' ? "flex-row-reverse" : ""
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 shadow-sm",
                message.role === 'user' ? "bg-zinc-900 text-white" : "bg-white border border-zinc-100 text-zinc-900"
              )}>
                {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={cn(
                "flex flex-col gap-1.5",
                message.role === 'user' ? "items-end" : "items-start"
              )}>
                <div className={cn(
                  "px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                  message.role === 'user' 
                    ? "bg-zinc-900 text-white rounded-tr-none" 
                    : "bg-gray-50 text-zinc-800 border border-gray-100 rounded-tl-none"
                )}>
                  {message.content}
                </div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{message.timestamp}</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Input Area */}
        <div className="p-6 border-t border-gray-50 bg-white">
          <div className="max-w-3xl mx-auto relative group">
            <div className="absolute left-4 bottom-4 flex gap-2">
              <button className="p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-lg transition-colors">
                <Paperclip size={18} />
              </button>
              <button className="p-2 text-zinc-400 hover:text-black hover:bg-zinc-100 rounded-lg transition-colors">
                <Sparkles size={18} />
              </button>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t('chat.placeholder_message', { model: selectedModel })}
              className="w-full pl-24 pr-14 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-black/5 transition-all resize-none min-h-[60px] max-h-[200px]"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim()}
              className="absolute right-3 bottom-3 p-2 bg-black text-white rounded-xl hover:bg-zinc-800 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-black/10 active:scale-95"
            >
              <Send size={18} />
            </button>
          </div>
          <p className="text-center text-[10px] text-zinc-400 mt-4 font-medium uppercase tracking-widest">
            {t('chat.openhub_uses_multiple_models_r')}</p>
        </div>
      </div>
    </div>
  );
}
