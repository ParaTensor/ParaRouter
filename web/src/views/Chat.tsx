import React, { useEffect, useRef, useState } from 'react';
import { Send, Plus, Search, MessageSquare, Trash2, User, Bot, Sparkles, ChevronRight, Zap, X, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from "react-i18next";
import { apiGet } from '../lib/api';
import { getAuthToken } from '../lib/session';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  model?: string;
}

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messages: Message[];
}

export default function ChatView() {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  
  // Load models from API
  useEffect(() => {
    apiGet<any[]>('/api/models')
      .then(res => {
        if (Array.isArray(res) && res.length > 0) {
          setModels(res);
          setSelectedModel(res[0].id);
        } else {
          setModels([]);
        }
      })
      .catch(err => {
        console.error("Failed to load models", err);
        setModels([]);
      });
  }, []);

  const groupedModels = models.reduce((acc, curr) => {
    const provider = curr.provider || 'Unknown Provider';
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(curr);
    return acc;
  }, {} as Record<string, any[]>);

  const selectedModelInfo = models.find(m => m.id === selectedModel);
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('chat_sessions');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [
      { id: '1', title: t('chat.new_chat'), lastMessage: t('chat.new_chat_started'), timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), messages: [{ id: '1', role: 'assistant', content: t('chat.assistant_greeting'), timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }] }
    ];
  });

  const [activeSessionId, setActiveSessionId] = useState(sessions[0]?.id || '1');
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const messages = activeSession?.messages || [];

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [streamingSessions, setStreamingSessions] = useState<Set<string>>(new Set());
  const isSessionStreaming = (sessionId: string) => streamingSessions.has(sessionId);
  const setSessionStreaming = (sessionId: string, streaming: boolean) => {
    setStreamingSessions(prev => {
      const next = new Set(prev);
      if (streaming) next.add(sessionId);
      else next.delete(sessionId);
      return next;
    });
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Focus and scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingSessions]);

  // Save to localstorage
  useEffect(() => {
    localStorage.setItem('chat_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const createNewSession = () => {
    const id = Date.now().toString();
    const newSession: ChatSession = {
      id,
      title: t('chat.new_chat'),
      lastMessage: t('chat.new_chat_started'),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      messages: [{ id: id + '-msg', role: 'assistant', content: t('chat.new_chat_started'), timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(id);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = sessions.filter(s => s.id !== id);
    if (remaining.length === 0) {
      createNewSession();
    } else {
      setSessions(remaining);
      if (activeSessionId === id) setActiveSessionId(remaining[0].id);
    }
  };

  const updateSession = (sessionId: string, newMessages: Message[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        const userMsg = newMessages.filter(m => m.role === 'user').pop();
        return {
          ...s,
          messages: newMessages,
          title: userMsg ? (userMsg.content.slice(0, 30) + (userMsg.content.length > 30 ? '...' : '')) : s.title,
          lastMessage: newMessages[newMessages.length - 1]?.content.slice(0, 50) || '',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
      }
      return s;
    }));
  };

  const handleSend = async () => {
    // Capture the session at the time of sending — immune to tab switches
    const sessionId = activeSessionId;
    if (!input.trim() || isSessionStreaming(sessionId)) return;
    
    const userContent = input.trim();
    setInput('');
    
    const sessionMessages = sessions.find(s => s.id === sessionId)?.messages || [];

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newMessages = [...sessionMessages, newUserMessage];
    updateSession(sessionId, newMessages);
    setSessionStreaming(sessionId, true);

    const assistantMsgId = (Date.now() + 1).toString();
    const initAssistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      model: selectedModelInfo?.name || selectedModel
    };

    let currentMessages = [...newMessages, initAssistantMsg];
    updateSession(sessionId, currentMessages);

    try {
      const token = getAuthToken();
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const payload = {
        model: selectedModel,
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        stream: true
      };

      const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '';
      
      const response = await fetch(`${API_BASE_URL}/api/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText);
      }

      if (!response.body) throw new Error("No body in response");

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let assistantContent = '';
      let done = false;
      
      while (!done) {
        const { value, done: isDone } = await reader.read();
        done = isDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const data = JSON.parse(line.slice(6));
                const delta = data.choices?.[0]?.delta?.content || '';
                if (delta) {
                  assistantContent += delta;
                  currentMessages = currentMessages.map(m => 
                    m.id === assistantMsgId ? { ...m, content: assistantContent } : m
                  );
                  updateSession(sessionId, currentMessages);
                }
              } catch (e) {
                console.warn("Failed to parse SSE line", line);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      currentMessages = currentMessages.map(m => 
        m.id === assistantMsgId ? { ...m, content: (m.content || "") + `\n\n**Error:** ${err.message || 'Unknown error occurred. Please check console or Gateway Logs.'}` } : m
      );
      updateSession(sessionId, currentMessages);
    } finally {
      setSessionStreaming(sessionId, false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-white border-x border-gray-100 overflow-hidden shadow-sm max-w-[1600px] w-full mx-auto">
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
                onClick={createNewSession}
                className="flex items-center justify-center gap-2 w-full bg-black text-white py-2.5 rounded-xl font-bold text-sm hover:bg-zinc-800 transition-all active:scale-95 shadow-lg shadow-black/5"
              >
                <Plus size={18} />
                {t('chat.new_chat')}
              </button>
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
                    <div className="flex-1 min-w-0 pr-6">
                      <h4 className={cn(
                        "text-xs font-bold truncate",
                        activeSessionId === session.id ? "text-zinc-900" : "text-zinc-600"
                      )}>{session.title}</h4>
                      <p className="text-[10px] text-zinc-400 truncate mt-0.5">{session.lastMessage}</p>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => deleteSession(session.id, e)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 h-full flex flex-col min-w-0 bg-white relative">
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
                <h3 className="font-bold text-sm">{t('chat.pararouter_assistant')}</h3>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{t('chat.system_online')}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative group/model">
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-full text-xs font-bold hover:border-black transition-all shadow-sm">
                <Zap size={14} className="text-yellow-500" />
                {selectedModelInfo?.name || selectedModel || 'Loading Models...'}
              </button>
              <div className="absolute right-0 mt-2 w-72 bg-white border border-zinc-100 rounded-xl shadow-xl opacity-0 invisible group-hover/model:opacity-100 group-hover/model:visible transition-all py-2 z-50 max-h-96 overflow-y-auto">
                {Object.entries(groupedModels).map(([provider, pModels]) => (
                  <div key={provider} className="mb-2 last:mb-0">
                    <div className="px-4 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider bg-zinc-50/90 flex items-center justify-between sticky top-0 backdrop-blur-sm z-10">
                      {provider}
                      <span className="font-normal opacity-50">{pModels.length}</span>
                    </div>
                    {pModels.map(m => (
                      <button 
                        key={m.id}
                        onClick={() => setSelectedModel(m.id)}
                        className={cn(
                          "w-full text-left px-4 py-2 text-xs transition-colors hover:bg-zinc-50 flex flex-col group",
                          selectedModel === m.id ? "bg-emerald-50/50" : ""
                        )}
                      >
                        <span className={cn("font-bold transition-colors group-hover:text-black", selectedModel === m.id ? "text-emerald-700" : "text-zinc-700")}>{m.name || m.id}</span>
                        <span className="text-[10px] text-zinc-400 mt-0.5">{m.id}</span>
                      </button>
                    ))}
                  </div>
                ))}
                {models.length === 0 && (
                  <div className="px-4 py-3 text-xs text-zinc-500 text-center">No models available</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth will-change-scroll pb-48">
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
                "flex flex-col gap-1.5 max-w-[80%]",
                message.role === 'user' ? "items-end" : "items-start"
              )}>
                <div className={cn(
                  "px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap",
                  message.role === 'user' 
                    ? "bg-zinc-900 text-white rounded-tr-none" 
                    : "bg-gray-50 text-zinc-800 border border-gray-100 rounded-tl-none"
                )}>
                  {message.content || (isSessionStreaming(activeSessionId) && message.role === 'assistant' ? <span className="animate-pulse">...</span> : null)}
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  <span>{message.timestamp}</span>
                  {message.role === 'assistant' && message.model && (
                    <>
                      <span className="opacity-50">•</span>
                      <span className="text-zinc-500">{message.model}</span>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-gray-50 bg-white/95 backdrop-blur-md z-10 w-full">
          <div className="max-w-3xl mx-auto w-full flex items-end p-[10px] pl-[18px] bg-gray-50 border border-gray-100 rounded-[28px] focus-within:ring-4 focus-within:ring-black/5 transition-all relative group">
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t('chat.placeholder_message', { model: selectedModel })}
              className="flex-1 w-full bg-transparent text-[15px] leading-[24px] focus:outline-none resize-none pt-[8px] pb-[8px] max-h-[200px]"
              rows={1}
              style={{ height: '40px' }}
              disabled={isSessionStreaming(activeSessionId)}
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || isSessionStreaming(activeSessionId) || !selectedModel}
              className="shrink-0 ml-3 mb-[3px] w-[34px] h-[34px] flex items-center justify-center bg-black text-white rounded-full hover:bg-zinc-800 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md shadow-black/5 active:scale-95"
            >
              {isSessionStreaming(activeSessionId) ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} className="mr-[1px]" />}
            </button>
          </div>
          <p className="text-center text-[10px] text-zinc-400 mt-4 font-medium uppercase tracking-widest">
            {t('chat.pararouter_uses_multiple_models_r')}</p>
        </div>
      </div>
    </div>
  );
}
