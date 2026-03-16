import React, { useMemo, useState } from 'react';
import { Transaction } from '../types';
import { normalizeAmount, formatCurrency } from '../utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { generateInsights } from '../services/geminiService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { 
    TrendingUp, 
    TrendingDown, 
    DollarSign, 
    PieChart, 
    Sparkles, 
    Download, 
    Calendar, 
    RefreshCw, 
    ChevronDown, 
    FileText, 
    Table,
    ArrowUpRight,
    ArrowDownRight,
    Wallet,
    BrainCircuit
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SummaryProps {
    sales: Transaction[];
    expenses: Transaction[];
}

const Summary: React.FC<SummaryProps> = ({ sales, expenses }) => {
    const [insights, setInsights] = useState<string | null>(null);
    const [loadingInsights, setLoadingInsights] = useState(false);

    // Filter States
    const [filter, setFilter] = useState<'Today' | 'This Week' | 'This Month' | 'All' | 'Custom'>('This Month');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isDateSelectorOpen, setIsDateSelectorOpen] = useState(false);
    const [isDownloadOpen, setIsDownloadOpen] = useState(false);

    // Filter Logic
    const { filteredSales, filteredExpenses, dateRangeString } = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        let start: Date | null = null;
        let end: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        if (filter === 'Today') {
            start = today;
        } else if (filter === 'This Week') {
            start = new Date(today);
            start.setDate(today.getDate() - today.getDay());
        } else if (filter === 'This Month') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (filter === 'Custom' && customStart && customEnd) {
            start = new Date(customStart + 'T00:00:00');
            end = new Date(customEnd + 'T23:59:59');
        } else if (filter === 'All') {
            start = null;
        }

        const filterFn = (tx: Transaction) => {
            if (!start) return true;
            const txDate = new Date(tx.Date + 'T00:00:00');
            return txDate >= start && txDate <= end;
        };

        const fSales = sales.filter(filterFn);
        const fExpenses = expenses.filter(filterFn);

        let label = 'All Time';
        if (filter === 'All') {
            label = 'All Time';
        } else if (start && end) {
            const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
            label = `${start.toLocaleDateString('en-US', opts)} - ${end.toLocaleDateString('en-US', opts)}`;
        } else if (filter === 'Custom') {
            label = 'Select Dates';
        }

        return { filteredSales: fSales, filteredExpenses: fExpenses, dateRangeString: label };
    }, [sales, expenses, filter, customStart, customEnd]);

    const totals = useMemo(() => {
        const tSales = filteredSales.reduce((sum, s) => sum + normalizeAmount(s.Amount), 0);
        const tExpenses = filteredExpenses.reduce((sum, e) => sum + normalizeAmount(e.Amount), 0);
        return { sales: tSales, expenses: tExpenses, profit: tSales - tExpenses };
    }, [filteredSales, filteredExpenses]);

    const bankBalances = useMemo(() => {
        const balances: Record<string, number> = {};
        filteredSales.forEach(s => {
            const m = s["Payment Method"] || 'Other';
            balances[m] = (balances[m] || 0) + normalizeAmount(s.Amount);
        });
        filteredExpenses.forEach(e => {
            const m = e["Payment Method"] || 'Other';
            balances[m] = (balances[m] || 0) - normalizeAmount(e.Amount);
        });
        return balances;
    }, [filteredSales, filteredExpenses]);

    const chartData = [
        { name: 'Sales', value: totals.sales, color: '#10b981' },
        { name: 'Expenses', value: totals.expenses, color: '#ef4444' }
    ];

    const handleGenerateInsights = async () => {
        setLoadingInsights(true);
        try {
            const html = await generateInsights(totals.sales, totals.expenses, totals.profit, bankBalances);
            setInsights(html);
        } catch (error: any) {
            setInsights(`<p class="text-xs text-red-400">Analysis failed: ${error.message || "Unknown error"}</p>`);
        } finally {
            setLoadingInsights(false);
        }
    };

    // Download Logic
    const downloadPDF = () => {
        const doc = new jsPDF();
        
        doc.setFontSize(20);
        doc.text("Financial Summary Report", 14, 20);
        
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
        doc.text(`Period: ${dateRangeString}`, 14, 34);

        doc.setFontSize(12);
        doc.text("Financial Overview", 14, 45);
        
        autoTable(doc, {
            startY: 50,
            head: [['Category', 'Amount']],
            body: [
                ['Total Sales', formatCurrency(totals.sales)],
                ['Total Expenses', formatCurrency(totals.expenses)],
                ['Gross Profit', formatCurrency(totals.profit)]
            ],
            theme: 'striped',
            headStyles: { fillColor: [59, 130, 246] }
        });

        const finalY = (doc as any).lastAutoTable.finalY + 15;
        doc.text("Balance Breakdown", 14, finalY);

        autoTable(doc, {
            startY: finalY + 5,
            head: [['Payment Method', 'Net Balance']],
            body: Object.entries(bankBalances).map(([method, amount]) => [method, formatCurrency(amount as number)]),
            theme: 'grid',
            headStyles: { fillColor: [75, 85, 99] }
        });

        doc.save(`summary_report_${new Date().toISOString().split('T')[0]}.pdf`);
        setIsDownloadOpen(false);
    };

    const downloadExcel = () => {
        const overviewData = [
            { Category: 'Total Sales', Amount: totals.sales },
            { Category: 'Total Expenses', Amount: totals.expenses },
            { Category: 'Gross Profit', Amount: totals.profit },
            { Category: '', Amount: '' }, // Spacer
            { Category: 'Balance Breakdown', Amount: '' },
            ...Object.entries(bankBalances).map(([method, amount]) => ({ Category: method, Amount: amount as number }))
        ];

        const ws = XLSX.utils.json_to_sheet(overviewData);
        
        // Basic Styling for Header
        const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "E5E7EB" } } };
        const range = XLSX.utils.decode_range(ws['!ref']!);
        
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_cell({ r: 0, c: C });
            if (!ws[address]) continue;
            ws[address].s = headerStyle;
        }

        ws['!cols'] = [{ wch: 25 }, { wch: 15 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Financial Summary");
        XLSX.writeFile(wb, `summary_report_${new Date().toISOString().split('T')[0]}.xlsx`);
        setIsDownloadOpen(false);
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8 md:h-full h-auto md:overflow-y-auto custom-scrollbar pr-2 pb-20"
        >
             
            {/* Control Bar */}
            <div className="bg-white/5 backdrop-blur-xl p-2 rounded-[2rem] border border-white/10 shadow-2xl flex flex-col md:flex-row gap-2 z-20 relative">
                 {/* Filter Dropdown */}
                 <div className="relative flex-1">
                    <button 
                        onClick={() => { setIsFilterOpen(!isFilterOpen); setIsDateSelectorOpen(false); setIsDownloadOpen(false); }}
                        className="w-full bg-white/5 hover:bg-white/10 border border-white/5 text-gray-200 font-medium py-3 px-6 rounded-[1.5rem] flex items-center justify-between text-sm transition-all"
                    >
                        <span className="truncate mr-1">{filter}</span>
                        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                        {isFilterOpen && (
                            <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute top-full left-0 right-0 mt-2 bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl z-30 overflow-hidden"
                            >
                                {['Today', 'This Week', 'This Month', 'All'].map((f) => (
                                    <button 
                                        key={f} 
                                        onClick={() => { setFilter(f as any); setIsFilterOpen(false); }}
                                        className="w-full text-left px-6 py-3.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5 last:border-0"
                                    >
                                        {f}
                                    </button>
                                ))}
                                <button 
                                    onClick={() => { setFilter('Custom'); setIsFilterOpen(false); setIsDateSelectorOpen(true); }}
                                    className="w-full text-left px-6 py-3.5 text-sm text-blue-400 hover:bg-white/5 hover:text-blue-300 transition-colors"
                                >
                                    Custom Range...
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Date Display / Opener */}
                <button 
                    onClick={() => { setIsDateSelectorOpen(!isDateSelectorOpen); setIsFilterOpen(false); setIsDownloadOpen(false); }}
                    className="flex-[2] bg-white/5 hover:bg-white/10 border border-white/5 rounded-[1.5rem] px-6 py-3 flex items-center justify-between text-gray-200 transition-colors group"
                >
                    <span className="font-medium text-sm truncate mr-2">{dateRangeString}</span>
                    <Calendar className="h-5 w-5 text-gray-500 flex-shrink-0 group-hover:text-blue-400 transition-colors" />
                </button>

                 {/* Download Button */}
                 <div className="relative">
                    <button 
                        onClick={() => { setIsDownloadOpen(!isDownloadOpen); setIsFilterOpen(false); setIsDateSelectorOpen(false); }}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-[1.5rem] flex items-center justify-center gap-2 text-sm transition-all shadow-lg shadow-blue-600/20"
                    >
                        <Download className="h-5 w-5" />
                        <span>Export</span>
                    </button>

                    <AnimatePresence>
                        {isDownloadOpen && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="absolute right-0 top-full mt-2 w-56 bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl z-30 overflow-hidden"
                            >
                                <button onClick={downloadPDF} className="w-full text-left px-6 py-4 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5 flex items-center justify-between group">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-red-400" />
                                        <span>PDF Report</span>
                                    </div>
                                    <span className="text-[10px] font-black text-red-500 bg-red-500/10 px-2 py-0.5 rounded uppercase">PDF</span>
                                </button>
                                <button onClick={downloadExcel} className="w-full text-left px-6 py-4 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors flex items-center justify-between group">
                                    <div className="flex items-center gap-2">
                                        <Table className="w-4 h-4 text-green-400" />
                                        <span>Excel Spreadsheet</span>
                                    </div>
                                    <span className="text-[10px] font-black text-green-500 bg-green-500/10 px-2 py-0.5 rounded uppercase">XLSX</span>
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                 </div>

                {/* Date Picker Modal */}
                <AnimatePresence>
                    {isDateSelectorOpen && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute top-full left-0 md:left-auto md:right-0 mt-2 p-6 bg-[#1c1c1e] border border-white/10 rounded-[2.5rem] shadow-2xl w-full max-w-sm z-30"
                        >
                            <div className="flex flex-col gap-4">
                                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                                    <label className="text-[10px] uppercase text-blue-400 font-black tracking-widest mb-2 block">Start Date</label>
                                    <input 
                                        type="date" 
                                        value={customStart} 
                                        onChange={(e) => { setCustomStart(e.target.value); setFilter('Custom'); }} 
                                        className="w-full bg-transparent border-none p-0 text-white focus:ring-0 outline-none font-bold text-base [color-scheme:dark]"
                                    />
                                </div>
                                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                                    <label className="text-[10px] uppercase text-purple-400 font-black tracking-widest mb-2 block">End Date</label>
                                    <input 
                                        type="date" 
                                        value={customEnd} 
                                        onChange={(e) => { setCustomEnd(e.target.value); setFilter('Custom'); }} 
                                        className="w-full bg-transparent border-none p-0 text-white focus:ring-0 outline-none font-bold text-base [color-scheme:dark]"
                                    />
                                </div>
                                <button 
                                    onClick={() => setIsDateSelectorOpen(false)}
                                    className="mt-2 w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-gray-200 transition-all text-sm active:scale-95"
                                >
                                    Apply Range
                                </button>
                                <button 
                                    onClick={() => { setFilter('All'); setCustomStart(''); setCustomEnd(''); setIsDateSelectorOpen(false); }}
                                    className="w-full bg-transparent text-gray-500 font-bold py-2 rounded-xl hover:text-white transition-all text-xs"
                                >
                                    Clear All Filters
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

             <div className="pt-4">
                <h2 className="text-2xl font-black text-white tracking-tight mb-6">Financial Overview</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    <motion.div 
                        whileHover={{ y: -5 }}
                        className="bg-white/5 backdrop-blur-md p-6 sm:p-8 rounded-[2rem] border border-white/10 flex flex-col items-center shadow-xl group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <ArrowUpRight className="w-12 h-12 text-green-400" />
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-500 font-black uppercase tracking-[0.2em] mb-3">Total Sales</p>
                        <p className="font-black text-green-400 text-3xl sm:text-4xl tracking-tighter">{formatCurrency(totals.sales)}</p>
                    </motion.div>
                    <motion.div 
                        whileHover={{ y: -5 }}
                        className="bg-white/5 backdrop-blur-md p-6 sm:p-8 rounded-[2rem] border border-white/10 flex flex-col items-center shadow-xl group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <ArrowDownRight className="w-12 h-12 text-red-400" />
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-500 font-black uppercase tracking-[0.2em] mb-3">Total Expenses</p>
                        <p className="font-black text-red-400 text-3xl sm:text-4xl tracking-tighter">{formatCurrency(totals.expenses)}</p>
                    </motion.div>
                    <motion.div 
                        whileHover={{ y: -5 }}
                        className="bg-gradient-to-br from-blue-600/20 to-indigo-600/20 backdrop-blur-md p-6 sm:p-8 rounded-[2rem] border border-blue-500/20 flex flex-col items-center sm:col-span-2 lg:col-span-1 shadow-xl group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <DollarSign className="w-12 h-12 text-white" />
                        </div>
                        <p className="text-[10px] sm:text-xs text-blue-400/60 font-black uppercase tracking-[0.2em] mb-3">Gross Profit</p>
                        <p className="font-black text-white text-3xl sm:text-4xl tracking-tighter">{formatCurrency(totals.profit)}</p>
                    </motion.div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                <div className="lg:col-span-2">
                    <h3 className="text-lg sm:text-xl font-black text-white tracking-tight mb-4 sm:mb-6 flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-blue-400" />
                        Cash Flow
                    </h3>
                    <div className="bg-white/5 backdrop-blur-md p-6 sm:p-8 rounded-[2.5rem] h-72 sm:h-96 border border-white/10 shadow-2xl">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <XAxis dataKey="name" stroke="#4b5563" tick={{fill: '#6b7280', fontSize: 11, fontWeight: 600}} axisLine={false} tickLine={false} />
                                <YAxis stroke="#4b5563" tick={{fill: '#6b7280', fontSize: 11, fontWeight: 600}} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: 'rgba(28, 28, 30, 0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', color: '#fff', fontSize: '13px', fontWeight: 'bold', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} 
                                    itemStyle={{ color: '#fff' }}
                                    cursor={{fill: 'rgba(255,255,255,0.03)'}}
                                />
                                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '20px' }} iconType="circle" />
                                <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={80}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="lg:col-span-1 flex flex-col">
                    <h3 className="text-lg sm:text-xl font-black text-white tracking-tight mb-4 sm:mb-6 flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-purple-400" />
                        Balance Breakdown
                    </h3>
                    <div className="bg-white/5 backdrop-blur-md rounded-[2.5rem] border border-white/10 overflow-hidden flex-1 shadow-2xl">
                        <div className="overflow-y-auto max-h-72 sm:max-h-none h-full">
                            <table className="w-full text-sm text-left text-gray-400">
                                <thead className="text-[10px] text-gray-500 uppercase font-black tracking-widest bg-white/5 sticky top-0 backdrop-blur-md">
                                    <tr><th className="px-8 py-4">Method</th><th className="px-8 py-4 text-right">Net</th></tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {Object.entries(bankBalances).map(([method, amount]) => (
                                        <tr key={method} className="hover:bg-white/5 transition-colors">
                                            <td className="px-8 py-5 font-bold text-gray-200">{method}</td>
                                            <td className={`px-8 py-5 text-right font-black text-base ${(amount as number) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(amount as number)}</td>
                                        </tr>
                                    ))}
                                    {Object.keys(bankBalances).length === 0 && (
                                        <tr><td colSpan={2} className="px-8 py-12 text-center text-gray-600 font-medium italic">No data for this period.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div className="pt-4">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-blue-400" />
                        AI Insights
                    </h3>
                </div>
                
                <motion.div 
                    layout
                    className="p-1 bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-indigo-500/20 rounded-[3rem] shadow-2xl"
                >
                    <div className="bg-[#1c1c1e]/80 backdrop-blur-2xl p-8 sm:p-10 rounded-[2.9rem] border border-white/5 relative overflow-hidden group">
                        <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl group-hover:bg-blue-600/20 transition-all duration-700"></div>
                        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl group-hover:bg-purple-600/20 transition-all duration-700"></div>
                        
                        {!insights && !loadingInsights && (
                            <div className="text-center relative z-10 py-4">
                                <motion.div 
                                    animate={{ 
                                        scale: [1, 1.05, 1],
                                        rotate: [0, 5, -5, 0]
                                    }}
                                    transition={{ 
                                        duration: 4, 
                                        repeat: Infinity,
                                        ease: "easeInOut"
                                    }}
                                    className="w-24 h-24 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-blue-600/30"
                                >
                                    <BrainCircuit className="h-12 w-12 text-white" />
                                </motion.div>
                                <h4 className="text-2xl font-black text-white mb-3">Unlock Financial Intelligence</h4>
                                <p className="text-gray-400 mb-10 max-w-md mx-auto text-sm leading-relaxed font-medium">Get personalized AI-powered analysis of your spending habits, sales trends, and profit optimization tips based on your real data.</p>
                                <button 
                                    onClick={handleGenerateInsights} 
                                    className="bg-white text-black font-black py-4 px-10 rounded-2xl hover:bg-blue-50 hover:text-blue-600 shadow-2xl transition-all active:scale-95 flex items-center gap-3 mx-auto group/btn"
                                >
                                    <Sparkles className="h-5 w-5 group-hover/btn:animate-pulse" />
                                    Generate Analysis
                                </button>
                            </div>
                        )}
                        
                        {loadingInsights && (
                            <div className="flex flex-col items-center justify-center py-12 relative z-10">
                                <div className="relative">
                                    <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Sparkles className="w-8 h-8 text-blue-400 animate-pulse" />
                                    </div>
                                </div>
                                <p className="mt-8 text-blue-300 font-black tracking-widest uppercase text-xs animate-pulse">Processing Intelligence...</p>
                            </div>
                        )}

                        {insights && (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="w-full relative z-10"
                            >
                                <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                                            <Sparkles className="h-6 w-6 text-white" />
                                        </div>
                                        <div>
                                            <h4 className="text-xl font-black text-white tracking-tight">FinDash Intelligence</h4>
                                            <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest">Analysis Complete</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={handleGenerateInsights} 
                                        className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all group active:scale-90"
                                        title="Refresh Analysis"
                                    >
                                        <RefreshCw className="h-5 w-5 text-gray-500 group-hover:text-blue-400 transition-colors" />
                                    </button>
                                </div>
                                <div 
                                    id="summary-insights-text" 
                                    className="prose prose-invert max-w-none prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-blue-400 prose-strong:font-black prose-ul:space-y-4 prose-li:bg-white/5 prose-li:p-4 prose-li:rounded-2xl prose-li:border prose-li:border-white/5" 
                                    dangerouslySetInnerHTML={{ __html: insights }} 
                                />
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
};

export default Summary;
