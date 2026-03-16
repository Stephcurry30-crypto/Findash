import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Transaction } from '../types';
import { createFinancialChat } from '../services/geminiService';
import { normalizeAmount, formatCurrency } from '../utils';
import { Chat, GenerateContentResponse } from "@google/genai";
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Sparkles, Trash2, ChevronDown, Bot, User } from 'lucide-react';

interface ChatbotProps {
    sales: Transaction[];
    expenses: Transaction[];
}

interface Message {
    role: 'user' | 'model';
    text: string;
    timestamp: Date;
}

const SUGGESTED_PROMPTS = [
    "What is my highest sale?",
    "Total profit this month?",
    "List my top 3 expenses",
    "Any sales above 5k?"
];

const Chatbot: React.FC<ChatbotProps> = ({ sales, expenses }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<Chat | null>(null);
    const [hasInitialized, setHasInitialized] = useState(false);

    // Calculate live context with granular data
    const financialContext = useMemo(() => {
        const totalSales = sales.reduce((sum, s) => sum + normalizeAmount(s.Amount), 0);
        const totalExpenses = expenses.reduce((sum, e) => sum + normalizeAmount(e.Amount), 0);
        const profit = totalSales - totalExpenses;
        
        const salesData = sales.map(s => 
            `[DATE: ${s.Date}] RECIPIENT: ${s.Recipient} | AMOUNT: ${s.Amount} | REF: ${s["Reference No."]} | BANK: ${s.Bank}`
        ).join('\n');

        const expensesData = expenses.map(e => 
            `[DATE: ${e.Date}] RECIPIENT: ${e.Recipient} | AMOUNT: ${e.Amount} | REF: ${e["Reference No."]} | BANK: ${e.Bank}`
        ).join('\n');

        return `
        You are FinDash, an expert financial analyst assistant.
        
        ### FINANCIAL SUMMARY
        - Total Sales: ${formatCurrency(totalSales)}
        - Total Expenses: ${formatCurrency(totalExpenses)}
        - Net Profit: ${formatCurrency(profit)}
        - Transaction Count: ${sales.length} Sales, ${expenses.length} Expenses

        ### RAW DATA (CRITICAL: Use this to answer specific questions like highest/lowest/specific dates)
        
        --- SALES RECORDS ---
        ${salesData}

        --- EXPENSE RECORDS ---
        ${expensesData}
        
        ### GUIDELINES
        1. **HIGHEST/LOWEST**: When asked for the "highest" or "lowest" sale/expense, you MUST scan the RAW DATA list above, compare the amounts, and identify the correct entry. Do not guess.
        2. **SPECIFIC SEARCH**: If asked about a Reference Number or specific Date, search the RAW DATA text exactly.
        3. **FORMATTING**: Bold all currency values (e.g., **₱1,500.00**) and use bullet points for lists.
        4. Keep answers concise but informative.
        `;
    }, [sales, expenses]);

    // Initialize Chat when opened
    useEffect(() => {
        if (isOpen && !hasInitialized) {
            chatRef.current = createFinancialChat(financialContext);
            setHasInitialized(true);
            
            const totalSales = sales.reduce((sum, s) => sum + normalizeAmount(s.Amount), 0);
            const totalExpenses = expenses.reduce((sum, e) => sum + normalizeAmount(e.Amount), 0);
            const profit = totalSales - totalExpenses;
            
            setMessages([
                { 
                    role: 'model', 
                    text: `Hi! I'm your FinDash AI. I've analyzed your **${sales.length}** sales and **${expenses.length}** expenses. Your current profit is **${formatCurrency(profit)}**. Ask me about highest sales, specific dates, or spending habits!`,
                    timestamp: new Date()
                }
            ]);
        }
    }, [isOpen, hasInitialized, financialContext, sales, expenses]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSend = async (textOverride?: string) => {
        const textToSend = textOverride || input;
        if (!textToSend.trim() || !chatRef.current) return;

        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: textToSend, timestamp: new Date() }]);
        setIsTyping(true);

        try {
            const resultStream = await chatRef.current.sendMessageStream({ message: textToSend });
            
            let fullResponse = "";
            setMessages(prev => [...prev, { role: 'model', text: "", timestamp: new Date() }]);

            for await (const chunk of resultStream) {
                const c = chunk as GenerateContentResponse;
                const text = c.text || "";
                fullResponse += text;
                
                setMessages(prev => {
                    const newMsgs = [...prev];
                    newMsgs[newMsgs.length - 1] = { 
                        ...newMsgs[newMsgs.length - 1], 
                        text: fullResponse 
                    };
                    return newMsgs;
                });
            }
        } catch (error: any) {
            console.error("Chat error", error);
            setMessages(prev => [...prev, { role: 'model', text: `I'm having trouble connecting: ${error.message || "Unknown error"}. Please check your API key and connection.`, timestamp: new Date() }]);
        } finally {
            setIsTyping(false);
        }
    };

    const clearChat = () => {
        setMessages([]);
        setHasInitialized(false);
        if (isOpen) {
            chatRef.current = createFinancialChat(financialContext);
            setHasInitialized(true);
            setMessages([
                { 
                    role: 'model', 
                    text: "Chat cleared. How can I help you with your finances today?",
                    timestamp: new Date()
                }
            ]);
        }
    };

    const formatMessageTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderContent = (text: string) => {
        let html = text
            .replace(/\*\*(.*?)\*\*/g, '<span class="font-bold text-blue-400">$1</span>')
            .replace(/^\s*•\s(.*)$/gm, '<li class="ml-4 list-disc">$1</li>');

        if (html.includes('<li')) {
            html = html.replace(/((<li.*<\/li>\s*)+)/g, '<ul class="my-2 space-y-1">$1</ul>');
        }
        
        return { __html: html.replace(/\n/g, '<br/>') };
    };

    return (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[60] flex flex-col items-end pointer-events-none">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20, transformOrigin: 'bottom right' }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="pointer-events-auto mb-4 w-[90vw] sm:w-[400px] h-[500px] sm:h-[650px] flex flex-col rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-2xl ring-1 ring-white/5"
                    >
                        {/* Atmospheric Background */}
                        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
                            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[80px] rounded-full" />
                            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[80px] rounded-full" />
                        </div>

                        {/* Header */}
                        <div className="px-6 py-4 border-b border-white/5 bg-white/5 backdrop-blur-xl flex justify-between items-center relative overflow-hidden">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg transform rotate-3">
                                        <Bot className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-[#0a0a0a] rounded-full" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-sm tracking-tight">FinDash AI</h3>
                                    <p className="text-[10px] text-blue-400 font-medium uppercase tracking-widest">Financial Expert</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={clearChat}
                                    className="p-2 rounded-xl bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-all active:scale-90"
                                    title="Clear Chat"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => setIsOpen(false)} 
                                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all active:scale-90"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                            {messages.map((msg, idx) => (
                                <motion.div 
                                    key={idx}
                                    initial={{ opacity: 0, y: 10, x: msg.role === 'user' ? 10 : -10 }}
                                    animate={{ opacity: 1, y: 0, x: 0 }}
                                    className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                                >
                                    <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center ${
                                        msg.role === 'user' ? 'bg-white/10' : 'bg-blue-600/20'
                                    }`}>
                                        {msg.role === 'user' ? <User className="w-4 h-4 text-gray-300" /> : <Bot className="w-4 h-4 text-blue-400" />}
                                    </div>
                                    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[80%]`}>
                                        <div className={`px-4 py-3 rounded-2xl text-[13.5px] leading-relaxed shadow-sm ${
                                            msg.role === 'user' 
                                            ? 'bg-blue-600 text-white rounded-tr-none' 
                                            : 'bg-white/5 text-gray-200 rounded-tl-none border border-white/5'
                                        }`}>
                                            <div dangerouslySetInnerHTML={renderContent(msg.text)} />
                                        </div>
                                        <span className="text-[9px] text-gray-500 mt-1.5 font-medium uppercase tracking-tighter opacity-60">
                                            {formatMessageTime(msg.timestamp)}
                                        </span>
                                    </div>
                                </motion.div>
                            ))}

                            {isTyping && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex gap-3"
                                >
                                    <div className="w-8 h-8 rounded-xl bg-blue-600/20 flex-shrink-0 flex items-center justify-center">
                                        <Bot className="w-4 h-4 text-blue-400" />
                                    </div>
                                    <div className="bg-white/5 px-4 py-3 rounded-2xl rounded-tl-none border border-white/5 flex gap-1.5 items-center h-[40px]">
                                        <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                                        <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                                        <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                                    </div>
                                </motion.div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Suggestions */}
                        {messages.length < 3 && (
                            <div className="px-6 pb-4 flex gap-2 overflow-x-auto no-scrollbar">
                                {SUGGESTED_PROMPTS.map((prompt, i) => (
                                    <motion.button
                                        key={i}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => handleSend(prompt)}
                                        className="whitespace-nowrap px-4 py-2 bg-white/5 hover:bg-blue-600/20 border border-white/10 rounded-2xl text-[11px] font-semibold text-gray-300 hover:text-blue-400 transition-all shadow-sm flex items-center gap-2"
                                    >
                                        <Sparkles className="w-3 h-3" />
                                        {prompt}
                                    </motion.button>
                                ))}
                            </div>
                        )}

                        {/* Input */}
                        <div className="p-4 bg-white/5 border-t border-white/5 backdrop-blur-3xl">
                            <form 
                                onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
                                className="relative flex items-center bg-black/40 border border-white/10 rounded-2xl focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all group"
                            >
                                <input 
                                    type="text" 
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Ask anything about your finances..."
                                    className="flex-1 bg-transparent border-none pl-5 pr-12 py-4 text-sm text-white focus:ring-0 outline-none placeholder-gray-500"
                                />
                                <button 
                                    type="submit" 
                                    disabled={!input.trim() || isTyping}
                                    className="absolute right-2 p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all disabled:opacity-0 disabled:scale-75 active:scale-90 shadow-lg shadow-blue-600/20"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </form>
                            <p className="text-[9px] text-center text-gray-600 mt-3 font-medium uppercase tracking-widest">Powered by FinDash AI Engine</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Trigger Button */}
            <motion.div 
                className="pointer-events-auto"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className={`group flex items-center gap-3 px-6 py-4 rounded-full shadow-2xl transition-all duration-500 border border-white/10 relative overflow-hidden ${
                        isOpen 
                        ? 'bg-white/10 text-white backdrop-blur-xl' 
                        : 'bg-blue-600 text-white shadow-blue-600/40'
                    }`}
                >
                    {/* Glow effect for closed state */}
                    {!isOpen && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    )}
                    
                    {isOpen ? (
                        <>
                            <X className="w-5 h-5" />
                            <span className="font-bold text-sm tracking-tight">Close Assistant</span>
                        </>
                    ) : (
                        <>
                            <div className="relative">
                                <MessageSquare className="w-5 h-5" />
                                <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-400 border-2 border-blue-600"></span>
                                </span>
                            </div>
                            <span className="font-bold text-sm tracking-tight">Ask FinDash AI</span>
                        </>
                    )}
                </button>
            </motion.div>
        </div>
    );
};

export default Chatbot;