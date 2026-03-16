import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Transaction } from '../types';
import { createFinancialChat } from '../services/geminiService';
import { normalizeAmount, formatCurrency } from '../utils';
import { Chat, GenerateContentResponse } from "@google/genai";

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
        
        // Serialize data for the AI to analyze specific entries
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
        } catch (error) {
            console.error("Chat error", error);
            setMessages(prev => [...prev, { role: 'model', text: "I'm having trouble connecting right now. Please try again later.", timestamp: new Date() }]);
        } finally {
            setIsTyping(false);
        }
    };

    const formatMessageTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderContent = (text: string) => {
        let html = text
            .replace(/\*\*(.*?)\*\*/g, '<span class="font-bold text-blue-300">$1</span>')
            .replace(/^\s*•\s(.*)$/gm, '<li class="ml-4 list-disc">$1</li>');

        if (html.includes('<li')) {
            html = html.replace(/((<li.*<\/li>\s*)+)/g, '<ul class="my-2 space-y-1">$1</ul>');
        }
        
        return { __html: html.replace(/\n/g, '<br/>') };
    };

    return (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[60] flex flex-col items-end font-sans pointer-events-none">
            {/* Chat Window */}
            <div className={`pointer-events-auto transition-all duration-300 ease-out origin-bottom-right mb-4 ${isOpen ? 'opacity-100 scale-100 translate-y-0 h-[450px] sm:h-[600px]' : 'opacity-0 scale-95 translate-y-4 pointer-events-none h-0'}`}>
                <div className="w-[85vw] sm:w-[360px] h-full rounded-[1.5rem] shadow-2xl flex flex-col overflow-hidden bg-[#1c1c1e] border border-white/10 ring-1 ring-white/5 relative">
                    
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-white/5 bg-[#2c2c2e]/50 backdrop-blur-md flex justify-between items-center z-10">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-sm">FinDash AI</h3>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                    <p className="text-[10px] text-gray-400">Online</p>
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={() => setIsOpen(false)} 
                            className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/20">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}>
                                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                    msg.role === 'user' 
                                    ? 'bg-blue-600 text-white rounded-br-sm' 
                                    : 'bg-[#2c2c2e] text-gray-200 rounded-bl-sm border border-white/5'
                                }`}>
                                    <div dangerouslySetInnerHTML={renderContent(msg.text)} />
                                </div>
                                <span className="text-[9px] text-gray-600 mt-1 px-1 opacity-70">
                                    {formatMessageTime(msg.timestamp)}
                                </span>
                            </div>
                        ))}

                        {isTyping && (
                            <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2">
                                <div className="bg-[#2c2c2e] px-4 py-3 rounded-2xl rounded-bl-sm border border-white/5 flex gap-1 items-center h-[40px]">
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></span>
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Suggestions */}
                    {messages.length < 3 && (
                        <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar mask-gradient bg-black/20">
                            {SUGGESTED_PROMPTS.map((prompt, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSend(prompt)}
                                    className="whitespace-nowrap px-3 py-1.5 bg-[#2c2c2e] hover:bg-blue-600 hover:text-white border border-white/10 rounded-full text-[11px] font-medium text-gray-300 transition-all active:scale-95 shadow-sm"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Input */}
                    <div className="p-3 bg-[#1c1c1e] border-t border-white/5 backdrop-blur-md">
                        <form 
                            onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
                            className="relative flex items-center bg-black/40 border border-white/10 rounded-full focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all"
                        >
                            <input 
                                type="text" 
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Message FinDash AI..."
                                className="flex-1 bg-transparent border-none pl-4 pr-10 py-3 text-sm text-white focus:ring-0 outline-none placeholder-gray-500"
                            />
                            <button 
                                type="submit" 
                                disabled={!input.trim() || isTyping}
                                className="absolute right-1.5 p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-all disabled:opacity-0 disabled:scale-75 active:scale-90"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Trigger Button - Pill Shape */}
            <div className="pointer-events-auto">
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className={`group flex items-center gap-2 px-3 py-2.5 sm:px-5 sm:py-3.5 rounded-full shadow-2xl transition-all duration-300 active:scale-95 border border-white/10 ${
                        isOpen 
                        ? 'bg-[#2c2c2e] text-white hover:bg-[#3a3a3c]' 
                        : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/30'
                    }`}
                >
                    {isOpen ? (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            <span className="font-bold text-xs sm:text-sm">Close</span>
                        </>
                    ) : (
                        <>
                            <div className="relative">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                                    <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
                                </svg>
                                <span className="absolute -top-1 -right-1 flex h-2 w-2 sm:h-2.5 sm:w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5 bg-green-400 border border-blue-600"></span>
                                </span>
                            </div>
                            <span className="font-bold text-xs sm:text-sm">Ask AI</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default Chatbot;