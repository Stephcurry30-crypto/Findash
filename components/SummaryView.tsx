import React, { useMemo, useState } from 'react';
import { Transaction } from '../types';
import { normalizeAmount, formatCurrency } from '../utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { generateInsights } from '../services/geminiService';

interface SummaryViewProps {
    sales: Transaction[];
    expenses: Transaction[];
}

const SummaryView: React.FC<SummaryViewProps> = ({ sales, expenses }) => {
    const [insights, setInsights] = useState<string | null>(null);
    const [loadingInsights, setLoadingInsights] = useState(false);
    const [showBreakdown, setShowBreakdown] = useState(false);

    const totals = useMemo(() => {
        const tSales = sales.reduce((sum, s) => sum + normalizeAmount(s.Amount), 0);
        const tExpenses = expenses.reduce((sum, e) => sum + normalizeAmount(e.Amount), 0);
        return { sales: tSales, expenses: tExpenses, profit: tSales - tExpenses };
    }, [sales, expenses]);

    const bankBalances = useMemo(() => {
        const balances: Record<string, number> = {};
        sales.forEach(s => {
            const m = s["Payment Method"] || 'Other';
            balances[m] = (balances[m] || 0) + normalizeAmount(s.Amount);
        });
        expenses.forEach(e => {
            const m = e["Payment Method"] || 'Other';
            balances[m] = (balances[m] || 0) - normalizeAmount(e.Amount);
        });
        return balances;
    }, [sales, expenses]);

    const chartData = [
        { name: 'Finances', Sales: totals.sales, Expenses: totals.expenses }
    ];

    const handleGenerateInsights = async () => {
        setLoadingInsights(true);
        try {
            const html = await generateInsights(totals.sales, totals.expenses, totals.profit, bankBalances);
            setInsights(html);
        } catch (error) {
            setInsights('<p class="text-xs text-red-400">Failed to generate insights.</p>');
        } finally {
            setLoadingInsights(false);
        }
    };

    return (
        <div className="fade-in space-y-6">
             <div>
                <h2 className="text-xl font-bold text-gray-200 mb-4">Financial Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-black/30 p-6 rounded-2xl border border-white/5 flex flex-col items-center">
                        <p className="text-sm text-gray-400 uppercase tracking-wider mb-2">Total Sales</p>
                        <p className="font-bold text-green-400 text-3xl">{formatCurrency(totals.sales)}</p>
                    </div>
                    <div className="bg-black/30 p-6 rounded-2xl border border-white/5 flex flex-col items-center">
                        <p className="text-sm text-gray-400 uppercase tracking-wider mb-2">Total Expenses</p>
                        <p className="font-bold text-red-400 text-3xl">{formatCurrency(totals.expenses)}</p>
                    </div>
                    <div className="bg-black/30 p-6 rounded-2xl border border-white/5 flex flex-col items-center">
                        <p className="text-sm text-gray-400 uppercase tracking-wider mb-2">Gross Profit</p>
                        <p className="font-bold text-white text-3xl">{formatCurrency(totals.profit)}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <h3 className="text-lg font-semibold text-gray-200 mb-4">Cash Flow</h3>
                    <div className="bg-black/20 p-6 rounded-2xl h-80 border border-gray-800">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <XAxis dataKey="name" stroke="#6b7280" tick={{fill: '#9ca3af'}} />
                                <YAxis stroke="#6b7280" tick={{fill: '#9ca3af'}} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} 
                                    itemStyle={{ color: '#fff' }}
                                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                                />
                                <Legend />
                                <Bar dataKey="Sales" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={100} />
                                <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={100} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="lg:col-span-1 flex flex-col">
                    <h3 className="text-lg font-semibold text-gray-200 mb-4">Balance Breakdown</h3>
                    <div className="bg-black/20 rounded-2xl border border-gray-800 overflow-hidden flex-1">
                        <div className="overflow-y-auto max-h-80">
                            <table className="w-full text-sm text-left text-gray-400">
                                <thead className="text-xs text-gray-500 uppercase bg-white/5 sticky top-0">
                                    <tr><th className="px-6 py-3">Method</th><th className="px-6 py-3 text-right">Net</th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/50">
                                    {Object.entries(bankBalances).map(([method, amount]) => (
                                        <tr key={method} className="hover:bg-white/5">
                                            <td className="px-6 py-4 font-medium text-gray-200">{method}</td>
                                            <td className={`px-6 py-4 text-right font-bold ${(amount as number) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(amount as number)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold text-gray-200 mb-4">AI Insights</h3>
                <div className="flex flex-col items-center justify-center p-8 bg-gradient-to-r from-blue-900/10 to-purple-900/10 border border-blue-500/10 rounded-2xl">
                    {!insights && !loadingInsights && (
                        <div className="text-center">
                            <p className="text-gray-400 mb-4">Get AI-powered analysis of your current financial standing.</p>
                            <button 
                                onClick={handleGenerateInsights} 
                                className="bg-blue-600 text-white font-bold py-3 px-6 rounded-full hover:bg-blue-700 shadow-lg shadow-blue-500/20 flex items-center gap-2 mx-auto"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM5.5 10a.5.5 0 01.5-.5h8a.5.5 0 010 1H6a.5.5 0 01-.5-.5z" fillOpacity="0" /></svg>
                                Generate Insights
                            </button>
                        </div>
                    )}
                    
                    {loadingInsights && (
                        <div className="flex flex-col items-center">
                            <div className="spinner !w-8 !h-8 !border-4 mb-4"></div>
                            <p className="text-blue-300 animate-pulse">Analyzing financial data...</p>
                        </div>
                    )}

                    {insights && (
                        <div className="w-full">
                            <div id="summary-insights-text" className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: insights }} />
                            <div className="mt-6 text-center">
                                 <button onClick={handleGenerateInsights} className="text-sm text-blue-400 hover:text-blue-300 font-medium">Refresh Insights</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SummaryView;