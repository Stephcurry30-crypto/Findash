import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, BankTransaction, ReconcileMatch } from '../types';
import { scanBankHistoryImage } from '../services/geminiService';
import { normalizeAmount, formatCurrency } from '../utils';
import { writeBatch, doc, collection, query, orderBy, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReconcileProps {
    userId: string;
    sales: Transaction[];
    expenses: Transaction[];
    droppedFiles?: File[];
    onFilesProcessed?: () => void;
}

interface ReconciliationSession {
    id: string;
    name: string;
    date: string;
    summary: {
        matched: number;
        missing: number;
        unmatched: number;
    };
    data: {
        matched: ReconcileMatch[];
        missingProofs: BankTransaction[];
        unmatchedReceipts: Transaction[];
    };
}

const Reconcile: React.FC<ReconcileProps> = ({ userId, sales, expenses, droppedFiles, onFilesProcessed }) => {
    // Filter State
    const [filter, setFilter] = useState<'Today' | 'This Week' | 'This Month' | 'All' | 'Custom'>('This Month');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isDateSelectorOpen, setIsDateSelectorOpen] = useState(false);

    // Operational State
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    
    // Results
    const [matched, setMatched] = useState<ReconcileMatch[]>([]);
    const [missingProofs, setMissingProofs] = useState<BankTransaction[]>([]);
    const [unmatchedReceipts, setUnmatchedReceipts] = useState<Transaction[]>([]);
    const [hasRun, setHasRun] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Session Management
    const [history, setHistory] = useState<ReconciliationSession[]>([]);
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [sessionName, setSessionName] = useState('');
    const [selectedMissing, setSelectedMissing] = useState<number[]>([]);

    // Load History
    useEffect(() => {
        const q = query(
            collection(db, `artifacts/default-app-id/users/${userId}/reconciliations`), 
            orderBy('date', 'desc')
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReconciliationSession));
            setHistory(items);
        });
        return () => unsubscribe();
    }, [userId]);

    // Handle Dropped Files
    useEffect(() => {
        if (droppedFiles && droppedFiles.length > 0) {
            const file = droppedFiles[0]; // Take first file
            if (file.type.startsWith('image/')) {
                setFile(file);
                runReconciliation(file);
            }
            if (onFilesProcessed) {
                onFilesProcessed();
            }
        }
    }, [droppedFiles]);

    // Filtering Logic
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
        if (start && end) {
            const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
            label = `${start.toLocaleDateString('en-US', opts)} - ${end.toLocaleDateString('en-US', opts)}`;
        } else if (filter === 'Custom') {
            label = 'Select Dates';
        }

        return { filteredSales: fSales, filteredExpenses: fExpenses, dateRangeString: label };
    }, [sales, expenses, filter, customStart, customEnd]);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            setFile(f);
            runReconciliation(f);
        }
    };

    const runReconciliation = async (fileToScan: File) => {
        setIsProcessing(true);
        setHasRun(false);
        setViewingId(null);
        setSelectedMissing([]);
        setSessionName(`Rec: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        setProgress(10);

        try {
            const reader = new FileReader();
            reader.readAsDataURL(fileToScan);
            const base64 = await new Promise<string>((resolve) => {
                reader.onload = (e) => resolve(e.target?.result as string);
            });
            const rawBase64 = base64.split(',')[1];
            const mimeType = fileToScan.type || "image/jpeg";
            
            setProgress(40);
            
            const bankDataRaw = await scanBankHistoryImage(rawBase64);
            
            setProgress(70);

            // Prepare Data
            const bankTxs: BankTransaction[] = bankDataRaw.map((t: any, idx: number) => ({
                id: `bank-${idx}`,
                date: t.date,
                description: t.description,
                amount: normalizeAmount(t.amount),
                reference: t.reference && t.reference !== 'N/A' ? t.reference : null,
                matched: false
            }));

            // USE FILTERED DATA HERE
            const recordedTxs = [
                ...filteredSales.map(s => ({ ...s, amountFloat: normalizeAmount(s.Amount), type: 'sales' as const, matched: false })),
                ...filteredExpenses.map(e => ({ ...e, amountFloat: -normalizeAmount(e.Amount), type: 'expenses' as const, matched: false }))
            ];

            const matches: ReconcileMatch[] = [];

            // Matching Logic (Tolerance 0.05)
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
                            amount: recordedTxs[matchIndex].amountFloat
                        }
                    });
                }
            }

            setMatched(matches);
            setMissingProofs(bankTxs.filter(t => !t.matched));
            setUnmatchedReceipts(recordedTxs.filter(t => !t.matched).map(t => {
                const { amountFloat, matched, ...rest } = t;
                return rest as Transaction;
            }));
            
            setProgress(100);
            
            setTimeout(() => {
                setHasRun(true);
                setIsProcessing(false);
                setProgress(0);
            }, 500);

        } catch (error) {
            console.error(error);
            alert("Reconciliation failed. See console.");
            setIsProcessing(false);
            setProgress(0);
        }
    };

    const toggleMissing = (index: number) => {
        if (viewingId) return; // Read only
        setSelectedMissing(prev => 
            prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
        );
    };

    const toggleAllMissing = () => {
        if (viewingId) return;
        if (selectedMissing.length === missingProofs.length) {
            setSelectedMissing([]);
        } else {
            setSelectedMissing(missingProofs.map((_, i) => i));
        }
    };

    // Toggle Type Override for a missing proof (Sales vs Expense)
    const toggleTypeOverride = (index: number) => {
        if (viewingId) return;
        const newMissing = [...missingProofs];
        const currentType = newMissing[index].typeOverride || (newMissing[index].amount > 0 ? 'sales' : 'expenses');
        newMissing[index].typeOverride = currentType === 'sales' ? 'expenses' : 'sales';
        setMissingProofs(newMissing);
    };

    const deleteMissingProof = (index: number) => {
        if (viewingId) return;
        if (window.confirm("Remove this transaction from the list?")) {
            // Uncheck if selected
            setSelectedMissing(prev => prev.filter(i => i !== index).map(i => i > index ? i - 1 : i));
            
            const newMissing = [...missingProofs];
            newMissing.splice(index, 1);
            setMissingProofs(newMissing);
        }
    };

    const deleteSelectedMissing = () => {
        if (viewingId || selectedMissing.length === 0) return;
        if (window.confirm(`Are you sure you want to remove ${selectedMissing.length} selected transactions?`)) {
            const newMissing = missingProofs.filter((_, i) => !selectedMissing.includes(i));
            setMissingProofs(newMissing);
            setSelectedMissing([]);
        }
    };

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this reconciliation record? This action cannot be undone.")) {
            try {
                 await deleteDoc(doc(db, `artifacts/default-app-id/users/${userId}/reconciliations`, sessionId));
            } catch (error) {
                console.error("Error deleting session:", error);
                alert("Failed to delete session.");
            }
        }
    };

    const saveReconciliation = async () => {
        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            let updateCount = 0;
            let createCount = 0;

            matched.forEach(m => {
                if (m.matchingRecord.id && m.matchingRecord.type) {
                    const colName = m.matchingRecord.type === 'sales' ? 'transactions' : 'expenses';
                    const ref = doc(db, `artifacts/default-app-id/users/${userId}/${colName}`, m.matchingRecord.id);
                    batch.update(ref, { matched: true });
                    updateCount++;
                }
            });

            selectedMissing.forEach(idx => {
                const tx = missingProofs[idx];
                const type = tx.typeOverride || (tx.amount > 0 ? 'sales' : 'expenses');
                const colName = type === 'sales' ? 'transactions' : 'expenses';
                const newDocRef = doc(collection(db, `artifacts/default-app-id/users/${userId}/${colName}`));
                
                batch.set(newDocRef, {
                    "Reference No.": tx.reference || "BANK-REC",
                    Recipient: tx.description,
                    Amount: formatCurrency(Math.abs(tx.amount)),
                    Date: tx.date !== 'N/A' ? tx.date : new Date().toISOString().split('T')[0],
                    Time: "00:00",
                    "Payment Method": "Bank Transfer",
                    Bank: "Reconciled",
                    type: type,
                    matched: true
                });
                createCount++;
            });

            const sessionRef = doc(collection(db, `artifacts/default-app-id/users/${userId}/reconciliations`));
            batch.set(sessionRef, {
                name: sessionName || `Rec: ${new Date().toLocaleDateString()}`,
                date: new Date().toISOString(),
                summary: {
                    matched: matched.length,
                    missing: missingProofs.length,
                    unmatched: unmatchedReceipts.length
                },
                data: {
                    matched,
                    missingProofs,
                    unmatchedReceipts
                }
            });

            await batch.commit();
            alert(`Saved "${sessionName}"! Verified ${updateCount} matches and added ${createCount} new records.`);
            reset();

        } catch (e) {
            console.error(e);
            alert("Failed to save reconciliation. Please check the console for details.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSessionNameChange = async (newName: string) => {
        setSessionName(newName);
        if (viewingId) {
            try {
                const ref = doc(db, `artifacts/default-app-id/users/${userId}/reconciliations`, viewingId);
                await updateDoc(ref, { name: newName });
            } catch (e) {
                console.error("Failed to rename session", e);
            }
        }
    };

    const openHistoryItem = (item: ReconciliationSession) => {
        setMatched(item.data.matched || []);
        setMissingProofs(item.data.missingProofs || []);
        setUnmatchedReceipts(item.data.unmatchedReceipts || []);
        setSessionName(item.name);
        setViewingId(item.id);
        setHasRun(true);
        setSelectedMissing([]);
    };

    const downloadReport = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text(sessionName || "Reconciliation Report", 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
        doc.text(`Matched: ${matched.length} | Missing: ${missingProofs.length} | Unmatched: ${unmatchedReceipts.length}`, 14, 34);

        let finalY = 40;

        if (matched.length > 0) {
            doc.setFontSize(14);
            doc.text("Matched Transactions", 14, finalY);
            autoTable(doc, {
                startY: finalY + 5,
                head: [['Bank Desc', 'App Ref', 'Amount']],
                body: matched.map(m => [m.bankTx.description, m.matchingRecord["Reference No."], formatCurrency(m.bankTx.amount)]),
                theme: 'striped',
                headStyles: { fillColor: [22, 163, 74] }
            });
            finalY = (doc as any).lastAutoTable.finalY + 15;
        }

        if (missingProofs.length > 0) {
            doc.setFontSize(14);
            doc.text("Missing Proofs (In Bank Only)", 14, finalY);
            autoTable(doc, {
                startY: finalY + 5,
                head: [['Date', 'Description', 'Ref', 'Amount']],
                body: missingProofs.map(t => [t.date, t.description, t.reference || 'N/A', formatCurrency(t.amount)]),
                theme: 'striped',
                headStyles: { fillColor: [234, 179, 8] }
            });
            finalY = (doc as any).lastAutoTable.finalY + 15;
        }

        if (unmatchedReceipts.length > 0) {
            doc.setFontSize(14);
            doc.text("Unmatched Receipts (In App Only)", 14, finalY);
            autoTable(doc, {
                startY: finalY + 5,
                head: [['Date', 'Recipient', 'Amount']],
                body: unmatchedReceipts.map(t => [t.Date, t.Recipient, t.Amount]),
                theme: 'striped',
                headStyles: { fillColor: [220, 38, 38] }
            });
        }

        doc.save(`${sessionName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.pdf`);
    };

    const reset = () => {
        setFile(null);
        setHasRun(false);
        setMatched([]);
        setMissingProofs([]);
        setUnmatchedReceipts([]);
        setSelectedMissing([]);
        setViewingId(null);
        setSessionName('');
    };

    if (isProcessing) {
        return (
            <div className="fixed inset-0 z-[160] bg-[#0a0a0a]/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
                <div className="w-full max-w-md space-y-12 text-center">
                    {/* Scanning Animation */}
                    <div className="relative w-32 h-32 mx-auto">
                        <div className="absolute inset-0 rounded-full border-4 border-blue-500/20"></div>
                        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                        <div className="absolute inset-4 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-2xl font-black text-white tracking-tight">
                            Reconciling History
                        </h3>
                        <p className="text-gray-400 text-sm font-medium">
                            Gemini AI is analyzing your bank statement...
                        </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-3">
                        <div className="flex justify-between text-[10px] font-black text-gray-500 uppercase tracking-widest">
                            <span>Analysis Progress</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                            <div 
                                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 ease-out shadow-[0_0_15px_rgba(37,99,235,0.5)]"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!hasRun) {
        return (
            <div id="reconcile-page" className="md:h-full h-auto fade-in md:overflow-y-auto lg:overflow-hidden pr-1 custom-scrollbar flex flex-col gap-6">
                {/* Filters Row */}
                <div className="bg-[#1c1c1e] p-3 sm:p-4 rounded-[1.5rem] border border-white/5 shadow-lg flex flex-col md:flex-row gap-3 sm:gap-4 z-20 relative">
                     {/* Filter Dropdown */}
                     <div className="relative flex-1">
                        <button 
                            onClick={() => { setIsFilterOpen(!isFilterOpen); setIsDateSelectorOpen(false); }}
                            className="w-full bg-[#2c2c2e] hover:bg-[#3a3a3c] border border-white/10 text-gray-200 font-semibold py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl flex items-center justify-between text-xs sm:text-sm transition-all"
                        >
                            <span className="truncate mr-1">{filter}</span>
                            <svg className={`w-3 h-3 sm:w-4 sm:h-4 text-gray-500 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        {isFilterOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-[#2c2c2e] border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden">
                                {['Today', 'This Week', 'This Month', 'All'].map((f) => (
                                    <button 
                                        key={f} 
                                        onClick={() => { setFilter(f as any); setIsFilterOpen(false); }}
                                        className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5 last:border-0"
                                    >
                                        {f}
                                    </button>
                                ))}
                                <button 
                                    onClick={() => { setFilter('Custom'); setIsFilterOpen(false); setIsDateSelectorOpen(true); }}
                                    className="w-full text-left px-4 py-3 text-sm text-blue-400 hover:bg-white/5 hover:text-blue-300 transition-colors"
                                >
                                    Custom Range...
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Date Display / Opener */}
                    <button 
                        onClick={() => { setIsDateSelectorOpen(!isDateSelectorOpen); setIsFilterOpen(false); }}
                        className="flex-[2] bg-[#2c2c2e] hover:bg-[#3a3a3c] border border-white/10 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between text-gray-200 transition-colors group"
                    >
                        <span className="font-medium text-xs sm:text-sm truncate mr-2">{dateRangeString}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </button>

                    {/* Date Picker Modal */}
                    {isDateSelectorOpen && (
                        <div className="absolute top-full left-0 md:left-auto md:right-0 mt-2 p-4 bg-[#1c1c1e] border border-white/10 rounded-[2rem] shadow-2xl w-full max-w-sm z-30 animate-in zoom-in-95 duration-200">
                             <div className="flex flex-col gap-2">
                                <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                    <label className="text-[10px] uppercase text-blue-400 font-bold mb-1 block">Start Date</label>
                                    <input 
                                        type="date" 
                                        value={customStart} 
                                        onChange={(e) => { setCustomStart(e.target.value); setFilter('Custom'); }} 
                                        className="w-full bg-transparent border-none p-0 text-white focus:ring-0 outline-none font-bold text-sm [color-scheme:dark]"
                                    />
                                </div>
                                <div className="flex justify-center -my-3 z-10 pointer-events-none"><div className="w-0.5 h-3 bg-white/10"></div></div>
                                <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                    <label className="text-[10px] uppercase text-purple-400 font-bold mb-1 block">End Date</label>
                                    <input 
                                        type="date" 
                                        value={customEnd} 
                                        onChange={(e) => { setCustomEnd(e.target.value); setFilter('Custom'); }} 
                                        className="w-full bg-transparent border-none p-0 text-white focus:ring-0 outline-none font-bold text-sm [color-scheme:dark]"
                                    />
                                </div>
                                <button 
                                    onClick={() => setIsDateSelectorOpen(false)}
                                    className="mt-2 w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-gray-200 transition-all text-sm"
                                >
                                    Apply Range
                                </button>
                                <button 
                                    onClick={() => { setFilter('All'); setCustomStart(''); setCustomEnd(''); setIsDateSelectorOpen(false); }}
                                    className="w-full bg-transparent text-gray-500 font-semibold py-2 rounded-xl hover:text-white transition-all text-xs"
                                >
                                    Clear / Show All
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-1 flex flex-col md:flex-row gap-6 md:min-h-0 min-h-[500px] h-auto lg:h-full">
                    {/* Left: Upload */}
                    <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
                         <div className="text-center mb-10">
                            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">New Reconciliation</h2>
                            <p className="text-gray-500 text-sm font-medium max-w-sm mx-auto leading-relaxed">
                                Match uploaded bank history against <b>{filter === 'All' ? 'ALL' : filter}</b> app receipts.
                            </p>
                        </div>
                        
                        <label id="reconcile-drop-zone" className="w-full max-w-lg aspect-[16/9] flex flex-col items-center justify-center p-8 text-center rounded-[1.5rem] cursor-pointer bg-white/5 hover:bg-white/10 transition-all duration-300 border border-white/10 hover:border-blue-500/50 group shadow-2xl shadow-black/20 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            <div className="bg-black/30 p-4 rounded-full mb-4 group-hover:scale-110 group-hover:bg-blue-600 transition-all duration-300 relative z-10 border border-white/5">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            </div>
                            <div className="relative z-10">
                                <span className="block font-semibold text-lg text-gray-200 mb-1 group-hover:text-white transition-colors">Upload Bank History</span>
                            </div>
                            <input type="file" onChange={handleFile} accept="image/*" className="hidden" />
                        </label>
                    </div>

                    {/* Right: History */}
                    <div className="flex-1 bg-[#1c1c1e] rounded-[1.5rem] border border-white/5 lg:overflow-hidden flex flex-col shadow-xl min-h-[400px] h-auto lg:h-full">
                        <div className="p-6 border-b border-white/5 bg-white/5">
                            <h3 className="font-bold text-white text-lg">Past Reconciliations</h3>
                        </div>
                        <div className="lg:flex-1 lg:overflow-y-auto p-2 custom-scrollbar space-y-2">
                            {history.length === 0 ? (
                                <div className="text-center py-12 text-gray-600 text-sm">No history found.</div>
                            ) : (
                                history.map(item => (
                                    <div 
                                        key={item.id} 
                                        onClick={() => openHistoryItem(item)}
                                        className="w-full text-left p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-blue-500/30 transition-all group relative cursor-pointer"
                                    >
                                        <div className="flex justify-between items-start mb-2 pr-8">
                                            <h4 className="font-bold text-gray-200 group-hover:text-white truncate">{item.name}</h4>
                                            <span className="text-[10px] text-gray-500 whitespace-nowrap ml-2">{new Date(item.date).toLocaleDateString()}</span>
                                        </div>
                                        <div className="flex gap-3 text-[10px] uppercase font-bold tracking-wider">
                                            <span className="text-green-500/80">{item.summary?.matched || 0} Matched</span>
                                            <span className="text-yellow-500/80">{item.summary?.missing || 0} Missing</span>
                                            <span className="text-red-500/80">{item.summary?.unmatched || 0} Unmatched</span>
                                        </div>
                                        <button 
                                            onClick={(e) => handleDeleteSession(e, item.id)}
                                            className="absolute top-3 right-3 p-1.5 text-gray-600 hover:text-red-400 hover:bg-white/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                            title="Delete Record"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div id="reconcile-results-dashboard" className="fade-in h-full flex flex-col gap-4 pr-1">
            {/* Header / Session Name */}
            <div className="bg-[#1c1c1e] p-4 sm:p-5 rounded-[1.5rem] border border-white/5 shadow-xl relative flex flex-col md:flex-row items-center gap-4 sm:gap-6 shrink-0 overflow-hidden">
                <div className="flex-1 w-full overflow-hidden">
                    <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                        <span className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold text-[10px] sm:text-xs border border-blue-500/30">ID</span>
                        <span className="text-[9px] sm:text-[10px] font-bold text-blue-400 uppercase tracking-widest truncate">{viewingId ? 'Archived Session' : 'New Reconciliation Session'}</span>
                    </div>
                    <input 
                        type="text" 
                        value={sessionName}
                        onChange={(e) => handleSessionNameChange(e.target.value)}
                        placeholder="Name this session..."
                        className="w-full bg-transparent border-none text-xl sm:text-2xl md:text-3xl font-black text-white focus:outline-none placeholder-gray-700 leading-tight mb-0.5 sm:mb-1"
                    />
                     <p className="text-gray-500 text-[10px] sm:text-xs font-medium pl-1 truncate">
                        {viewingId ? `Recorded on ${new Date().toLocaleDateString()}` : 'Give this reconciliation a unique name.'}
                    </p>
                </div>
                <div className="flex gap-1 sm:gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-start border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0">
                     <div className="text-center px-2 sm:px-4">
                        <div className="text-xl sm:text-2xl font-black text-green-400">{matched.length}</div>
                        <div className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase">Matched</div>
                     </div>
                     <div className="w-px bg-white/10"></div>
                     <div className="text-center px-2 sm:px-4">
                        <div className="text-xl sm:text-2xl font-black text-yellow-400">{missingProofs.length}</div>
                        <div className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase">Missing</div>
                     </div>
                     <div className="w-px bg-white/10"></div>
                     <div className="text-center px-2 sm:px-4">
                        <div className="text-xl sm:text-2xl font-black text-red-400">{unmatchedReceipts.length}</div>
                        <div className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase">Unmatched</div>
                     </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-hidden">
                
                {/* MATCHED SECTION */}
                <div className="bg-[#1c1c1e] rounded-[1.5rem] border border-white/5 shadow-xl relative flex flex-col h-full overflow-hidden">
                    <div className="p-4 border-b border-white/5 bg-[#2c2c2e]/20 shrink-0 flex flex-col gap-1 min-h-[5.5rem] justify-center">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <h3 className="text-green-500 font-bold text-sm">Matched ({matched.length})</h3>
                        </div>
                        <p className="text-[10px] text-gray-500 pl-6 leading-relaxed">
                            Bank transactions that have been successfully<br/>linked to an existing record in your app.
                        </p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-[#1c1c1e] text-[10px] uppercase text-gray-500 font-bold tracking-wider sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 bg-[#1c1c1e]">Transaction Details</th>
                                    <th className="px-4 py-3 text-right bg-[#1c1c1e]">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {matched.length === 0 ? (
                                    <tr><td colSpan={2} className="px-5 py-20 text-center text-gray-600 italic">No matches found.</td></tr>
                                ) : (
                                    matched.map((m, i) => (
                                        <tr key={i} className="hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="text-white font-bold mb-0.5">{m.bankTx.description}</div>
                                                <div className="flex gap-2 text-[10px]">
                                                    <span className="text-gray-500">{m.bankTx.date}</span>
                                                    <span className="text-gray-400 font-mono bg-white/5 px-1.5 rounded border border-white/5">Ref: {m.matchingRecord["Reference No."]}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right text-green-400 font-bold">
                                                {formatCurrency(m.bankTx.amount)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* MISSING PROOFS SECTION */}
                <div className="bg-[#1c1c1e] rounded-[1.5rem] border border-white/5 shadow-xl relative flex flex-col h-full overflow-hidden">
                    <div className="p-4 border-b border-white/5 bg-[#2c2c2e]/20 shrink-0 flex flex-col gap-1 min-h-[5.5rem] justify-center">
                        <div className="flex items-center gap-2 w-full">
                            <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            <h3 className="text-yellow-500 font-bold text-sm truncate flex-1">Missing Proofs ({missingProofs.length})</h3>
                             {!viewingId && missingProofs.length > 0 && (
                                 <div className="flex items-center gap-3 flex-shrink-0">
                                    {selectedMissing.length > 0 && (
                                        <button 
                                            onClick={deleteSelectedMissing}
                                            className="text-[10px] text-red-500 font-bold uppercase hover:text-red-400 transition-colors flex items-center gap-1"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            Delete ({selectedMissing.length})
                                        </button>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <label className="text-[10px] text-gray-500 font-bold uppercase cursor-pointer">All</label>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedMissing.length === missingProofs.length}
                                            onChange={toggleAllMissing}
                                            className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                                        />
                                    </div>
                                 </div>
                            )}
                        </div>
                         <p className="text-[10px] text-gray-500 pl-6 leading-relaxed">
                            Transactions found in your uploaded bank statement<br/>that have not been recorded in the app yet.
                        </p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-[#1c1c1e] text-[10px] uppercase text-gray-500 font-bold tracking-wider sticky top-0 z-10 shadow-sm">
                                <tr>
                                    {!viewingId && <th className="px-3 py-3 w-8 bg-[#1c1c1e]"></th>}
                                    <th className="px-3 py-3 bg-[#1c1c1e]">Details</th>
                                    <th className="px-3 py-3 text-right bg-[#1c1c1e]">Amount</th>
                                    {!viewingId && <th className="px-2 py-3 w-8 bg-[#1c1c1e]"></th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {missingProofs.length === 0 ? (
                                    <tr><td colSpan={viewingId ? 2 : 4} className="px-5 py-20 text-center text-gray-600 italic">No missing proofs.</td></tr>
                                ) : (
                                    missingProofs.map((tx, i) => {
                                        const effectiveType = tx.typeOverride || (tx.amount > 0 ? 'sales' : 'expenses');
                                        return (
                                            <tr key={i} className={`hover:bg-white/5 transition-colors ${selectedMissing.includes(i) ? 'bg-blue-500/10' : ''}`}>
                                                {!viewingId && (
                                                    <td className="px-3 py-3 text-center">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedMissing.includes(i)}
                                                            onChange={() => toggleMissing(i)}
                                                            className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                                                        />
                                                    </td>
                                                )}
                                                <td className="px-3 py-3">
                                                    <div className="text-white font-bold mb-0.5">{tx.description}</div>
                                                    <div className="flex flex-col gap-1 text-[10px]">
                                                        <div className="flex gap-2">
                                                            <span className="text-gray-500">{tx.date}</span>
                                                            <span className="text-gray-400 font-mono bg-white/5 px-1.5 rounded border border-white/5">Ref: {tx.reference || 'N/A'}</span>
                                                        </div>
                                                        {!viewingId ? (
                                                            <div className="flex items-center bg-[#2c2c2e] rounded-lg p-0.5 border border-white/10 w-fit mt-1">
                                                                <button 
                                                                    onClick={() => { if(effectiveType !== 'sales') toggleTypeOverride(i); }}
                                                                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all ${
                                                                        effectiveType === 'sales'
                                                                        ? 'bg-blue-600 text-white shadow-sm' 
                                                                        : 'text-gray-500 hover:text-gray-300'
                                                                    }`}
                                                                >
                                                                    Business
                                                                </button>
                                                                <button 
                                                                    onClick={() => { if(effectiveType !== 'expenses') toggleTypeOverride(i); }}
                                                                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all ${
                                                                        effectiveType === 'expenses'
                                                                        ? 'bg-purple-600 text-white shadow-sm' 
                                                                        : 'text-gray-500 hover:text-gray-300'
                                                                    }`}
                                                                >
                                                                    Expense
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase w-fit mt-1 border ${
                                                                effectiveType === 'sales'
                                                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
                                                                : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                                                            }`}>
                                                                {effectiveType === 'sales' ? 'Business' : 'Expense'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className={`px-3 py-3 text-right font-bold ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {formatCurrency(tx.amount)}
                                                </td>
                                                {!viewingId && (
                                                    <td className="px-2 py-3 text-center">
                                                        <button onClick={() => deleteMissingProof(i)} className="text-gray-600 hover:text-red-400 transition-colors">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* UNMATCHED RECEIPTS SECTION */}
                <div className="bg-[#1c1c1e] rounded-[1.5rem] border border-white/5 shadow-xl relative flex flex-col h-full overflow-hidden">
                    <div className="p-4 border-b border-white/5 bg-[#2c2c2e]/20 shrink-0 flex flex-col gap-1 min-h-[5.5rem] justify-center">
                         <div className="flex items-center gap-2">
                             <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <h3 className="text-red-500 font-bold text-sm">Unmatched ({unmatchedReceipts.length})</h3>
                         </div>
                         <p className="text-[10px] text-gray-500 pl-6 leading-relaxed">
                            Records created in the app that could not<br/>be found in the uploaded bank statement.
                        </p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-[#1c1c1e] text-[10px] uppercase text-gray-500 font-bold tracking-wider sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 bg-[#1c1c1e]">Receipt Details</th>
                                    <th className="px-4 py-3 text-right bg-[#1c1c1e]">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {unmatchedReceipts.length === 0 ? (
                                    <tr><td colSpan={2} className="px-5 py-20 text-center text-gray-600 italic">No unmatched receipts.</td></tr>
                                ) : (
                                    unmatchedReceipts.map((tx, i) => (
                                        <tr key={i} className="hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="text-white font-bold mb-0.5">{tx.Recipient}</div>
                                                <div className="flex gap-2 text-[10px]">
                                                    <span className="text-gray-500">{tx.Date}</span>
                                                    <span className="text-gray-400 font-mono bg-white/5 px-1.5 rounded border border-white/5">Ref: {tx["Reference No."]}</span>
                                                </div>
                                            </td>
                                            <td className={`px-4 py-3 text-right font-bold ${tx.type === 'sales' ? 'text-green-400' : 'text-red-400'}`}>
                                                {tx.Amount}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="shrink-0 flex justify-center items-center gap-3 mt-2">
                {viewingId ? (
                    <button onClick={reset} className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-bold text-sm rounded-xl transition-all border border-white/10 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back to List
                    </button>
                ) : (
                    <button onClick={reset} className="px-6 py-3 bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs rounded-xl transition-all border border-white/10">
                        Cancel
                    </button>
                )}
                
                <button onClick={downloadReport} className="px-6 py-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 font-bold text-xs rounded-xl transition-all border border-blue-500/30 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download Report
                </button>

                {!viewingId && (
                    <button 
                        onClick={saveReconciliation}
                        disabled={isSaving}
                        className={`px-8 py-3 font-bold text-sm rounded-xl shadow-lg transition-all active:scale-95 border flex items-center gap-2 ${
                            (matched.length > 0 || selectedMissing.length > 0)
                            ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-500/20 border-green-400/20' 
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 border-blue-400/20'
                        }`}
                    >
                        {isSaving ? <div className="spinner !w-4 !h-4 !border-2"></div> : null}
                        {isSaving ? 'Saving...' : (matched.length > 0 || selectedMissing.length > 0) ? `Confirm & Save (${matched.length + selectedMissing.length})` : 'Confirm Review'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default Reconcile;