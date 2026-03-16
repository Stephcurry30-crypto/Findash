import React, { useState } from 'react';
import { Transaction, BankTransaction, ReconcileMatch } from '../types';
import { scanBankHistoryImage } from '../services/geminiService';
import { normalizeAmount, formatCurrency } from '../utils';

interface ReconcileViewProps {
    sales: Transaction[];
    expenses: Transaction[];
}

const ReconcileView: React.FC<ReconcileViewProps> = ({ sales, expenses }) => {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressText, setProgressText] = useState('');
    
    // Results
    const [matched, setMatched] = useState<ReconcileMatch[]>([]);
    const [missingProofs, setMissingProofs] = useState<BankTransaction[]>([]);
    const [unmatchedReceipts, setUnmatchedReceipts] = useState<Transaction[]>([]);
    const [hasRun, setHasRun] = useState(false);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            setFile(f);
            const reader = new FileReader();
            reader.onload = (ev) => setPreview(ev.target?.result as string);
            reader.readAsDataURL(f);
            runReconciliation(f);
        }
    };

    const runReconciliation = async (fileToScan: File) => {
        setIsProcessing(true);
        setHasRun(false);
        setProgressText('Reading bank history...');
        setProgress(25);

        try {
            const reader = new FileReader();
            reader.readAsDataURL(fileToScan);
            const base64 = await new Promise<string>((resolve) => {
                reader.onload = (e) => resolve(e.target?.result as string);
            });
            const rawBase64 = base64.split(',')[1];
            const mimeType = fileToScan.type || "image/jpeg";
            
            const bankDataRaw = await scanBankHistoryImage(rawBase64);
            
            setProgressText('Cross-checking with records...');
            setProgress(60);

            // Prepare Data
            const bankTxs: BankTransaction[] = bankDataRaw.map((t: any, idx: number) => ({
                id: `bank-${idx}`,
                date: t.date,
                description: t.description,
                amount: normalizeAmount(t.amount), // Signed float
                matched: false
            }));

            // Prepare local records (Sales positive, Expenses negative)
            const recordedTxs = [
                ...sales.map(s => ({ ...s, amountFloat: normalizeAmount(s.Amount), type: 'sales' as const, matched: false })),
                ...expenses.map(e => ({ ...e, amountFloat: -normalizeAmount(e.Amount), type: 'expenses' as const, matched: false }))
            ];

            const matches: ReconcileMatch[] = [];

            // Matching Logic
            for (const bankTx of bankTxs) {
                if (bankTx.amount === 0) continue;
                
                const matchIndex = recordedTxs.findIndex(rt => !rt.matched && Math.abs(rt.amountFloat - bankTx.amount) < 0.05);
                
                if (matchIndex !== -1) {
                    bankTx.matched = true;
                    recordedTxs[matchIndex].matched = true;
                    matches.push({
                        bankTx,
                        matchingRecord: {
                            ...recordedTxs[matchIndex],
                            amount: recordedTxs[matchIndex].amountFloat // for display consistency
                        }
                    });
                }
            }

            setMatched(matches);
            setMissingProofs(bankTxs.filter(t => !t.matched));
            // Filter out internal temporary fields before setting state
            setUnmatchedReceipts(recordedTxs.filter(t => !t.matched).map(t => {
                const { amountFloat, matched, ...rest } = t;
                return rest as Transaction;
            }));
            
            setProgress(100);
            setHasRun(true);

        } catch (error) {
            console.error(error);
            alert("Reconciliation failed. See console.");
        } finally {
            setIsProcessing(false);
        }
    };

    const removeMissingProof = (index: number) => {
        const newList = [...missingProofs];
        newList.splice(index, 1);
        setMissingProofs(newList);
    };

    const reset = () => {
        setFile(null);
        setPreview(null);
        setHasRun(false);
    };

    if (!hasRun && !isProcessing) {
        return (
            <div id="reconcile-page" className="h-full flex flex-col justify-center items-center py-12 px-4 overflow-y-auto lg:overflow-hidden">
                <div className="text-center mb-10">
                    <h2 className="text-3xl font-extrabold text-white mb-3">Reconciliation</h2>
                    <p className="text-gray-400 text-lg">Match your bank history against saved receipts automatically.</p>
                </div>
                <label id="reconcile-drop-zone" className="w-full max-w-2xl flex flex-col items-center justify-center p-16 text-center rounded-[2.5rem] cursor-pointer hover:bg-white/5 transition-all border-2 border-dashed border-gray-600 hover:border-blue-500 group shadow-2xl shadow-black/20">
                    <div className="bg-gray-800 p-6 rounded-full mb-8 group-hover:scale-110 group-hover:bg-blue-600 transition-all duration-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    </div>
                    <span className="font-bold text-2xl text-white mb-3 group-hover:text-blue-200 transition-colors">Upload Bank History</span>
                    <span className="text-gray-500 text-base font-medium">Supports Screenshots from GCash, BPI, etc.</span>
                    <input type="file" onChange={handleFile} accept="image/*" className="hidden" />
                </label>
            </div>
        );
    }

    if (isProcessing) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <div className="w-full max-w-md text-center">
                    <div className="spinner !w-16 !h-16 !border-4 mb-8 mx-auto shadow-lg shadow-blue-500/20"></div>
                    <p className="text-2xl font-bold text-white mb-3 animate-pulse">{progressText}</p>
                    <p className="text-sm text-gray-500 mb-8 font-medium">Analyzing transaction data...</p>
                    <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                        <div className="bg-blue-600 h-3 rounded-full transition-all duration-500 shadow-[0_0_15px_rgba(37,99,235,0.5)]" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div id="reconcile-results-dashboard" className="fade-in h-full flex flex-col space-y-8 overflow-y-auto lg:overflow-hidden pb-4 custom-scrollbar">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-shrink-0">
                <div className="bg-gradient-to-br from-green-900/20 to-green-900/5 border border-green-500/20 p-8 rounded-[1.5rem] flex flex-col items-center justify-center shadow-lg">
                    <p className="text-xs font-bold text-green-400 uppercase tracking-widest mb-2">Matched</p>
                    <p className="font-black text-white text-5xl">{matched.length}</p>
                </div>
                <div className="bg-gradient-to-br from-yellow-900/20 to-yellow-900/5 border border-yellow-500/20 p-8 rounded-[1.5rem] flex flex-col items-center justify-center shadow-lg">
                    <p className="text-xs font-bold text-yellow-400 uppercase tracking-widest mb-2">Missing Proofs</p>
                    <p className="font-black text-white text-5xl">{missingProofs.length}</p>
                    <p className="text-[10px] text-yellow-500/60 mt-2 font-bold uppercase">In bank, not in app</p>
                </div>
                <div className="bg-gradient-to-br from-red-900/20 to-red-900/5 border border-red-500/20 p-8 rounded-[1.5rem] flex flex-col items-center justify-center shadow-lg">
                    <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2">Unmatched</p>
                    <p className="font-black text-white text-5xl">{unmatchedReceipts.length}</p>
                    <p className="text-[10px] text-red-500/60 mt-2 font-bold uppercase">In app, not in bank</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:flex-1 lg:min-h-0">
                {/* Matched Column */}
                <div className="lg:col-span-2 flex flex-col min-h-[300px] lg:min-h-0 lg:h-full">
                    <div className="bg-[#1c1c1e] rounded-[1.5rem] border border-white/5 lg:overflow-hidden flex flex-col h-full shadow-xl">
                        <div className="px-6 py-5 border-b border-white/5 bg-white/5 flex justify-between items-center backdrop-blur-md sticky top-0 z-10">
                            <h3 className="font-bold text-green-400 flex items-center gap-2 text-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                Matched Transactions
                            </h3>
                            <span className="text-xs font-mono font-bold text-gray-500 bg-black/20 px-3 py-1 rounded-full">{matched.length} ITEMS</span>
                        </div>
                        <div className="lg:flex-1 lg:overflow-y-auto p-2">
                            <table className="w-full text-sm text-left text-gray-400">
                                <tbody>
                                    {matched.map((m, i) => (
                                        <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors rounded-xl">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-white text-base">{m.bankTx.description}</div>
                                                <div className="text-xs text-gray-500 mt-1">Matched to: <span className="text-gray-300">{m.matchingRecord["Reference No."]}</span></div>
                                            </td>
                                            <td className="px-6 py-4 text-right text-green-400 font-bold text-lg">{formatCurrency(m.bankTx.amount)}</td>
                                        </tr>
                                    ))}
                                    {matched.length === 0 && <tr><td colSpan={2} className="text-center py-12 text-gray-600 font-medium">No matches found.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Missing Proofs */}
                <div className="bg-[#1c1c1e] rounded-[1.5rem] border border-white/5 lg:overflow-hidden flex flex-col min-h-[300px] lg:min-h-0 lg:h-full shadow-xl">
                    <div className="px-6 py-5 border-b border-white/5 bg-white/5 backdrop-blur-md sticky top-0 z-10">
                        <h3 className="font-bold text-yellow-400 flex items-center gap-2 text-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            Missing Proofs
                        </h3>
                    </div>
                    <div className="lg:flex-1 lg:overflow-y-auto p-2">
                        <table className="w-full text-sm text-left text-gray-400">
                            <tbody>
                                {missingProofs.map((tx, i) => (
                                    <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors rounded-xl">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-white text-base">{tx.description}</div>
                                            <div className="text-xs text-gray-500 mt-1 font-medium">{tx.date}</div>
                                        </td>
                                        <td className={`px-4 py-4 text-right font-bold text-base ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(tx.amount)}</td>
                                        <td className="px-4 text-right">
                                            <button onClick={() => removeMissingProof(i)} className="text-gray-600 hover:text-red-500 p-2 rounded-lg hover:bg-white/10 transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {missingProofs.length === 0 && <tr><td colSpan={3} className="text-center py-12 text-gray-600 font-medium">Great! No missing proofs.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Unmatched Receipts */}
                <div className="bg-[#1c1c1e] rounded-[1.5rem] border border-white/5 lg:overflow-hidden flex flex-col min-h-[300px] lg:min-h-0 lg:h-full shadow-xl">
                    <div className="px-6 py-5 border-b border-white/5 bg-white/5 backdrop-blur-md sticky top-0 z-10">
                        <h3 className="font-bold text-red-400 flex items-center gap-2 text-lg">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            Unmatched Receipts
                        </h3>
                    </div>
                    <div className="lg:flex-1 lg:overflow-y-auto p-2">
                         <table className="w-full text-sm text-left text-gray-400">
                            <tbody>
                                {unmatchedReceipts.map((tx, i) => (
                                    <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors rounded-xl">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-white text-base">{tx.Recipient}</div>
                                            <div className="text-xs text-gray-500 mt-1 font-mono bg-white/5 px-2 py-0.5 rounded inline-block">{tx["Reference No."]}</div>
                                        </td>
                                        <td className={`px-6 py-4 text-right font-bold text-base ${tx.type === 'sales' ? 'text-green-400' : 'text-red-400'}`}>{tx.Amount}</td>
                                    </tr>
                                ))}
                                {unmatchedReceipts.length === 0 && <tr><td colSpan={2} className="text-center py-12 text-gray-600 font-medium">All receipts matched!</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="flex justify-center mt-10 pb-4 flex-shrink-0">
                <button onClick={reset} className="px-10 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-xl shadow-blue-500/20 transition-all active:scale-95">Start New Reconciliation</button>
            </div>
        </div>
    );
};

export default ReconcileView;