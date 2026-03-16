import React, { useState, useMemo } from 'react';
import { Transaction } from '../types';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { normalizeAmount, formatCurrency, collectionNameForView, formatDateForDisplay } from '../utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface TransactionListProps {
    userId: string;
    data: Transaction[];
    type: 'sales' | 'expenses';
}

const TransactionList: React.FC<TransactionListProps> = ({ userId, data, type }) => {
    const [filter, setFilter] = useState<'Today' | 'This Week' | 'This Month' | 'All' | 'Custom'>('This Month');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isDownloadOpen, setIsDownloadOpen] = useState(false);
    const [isDateSelectorOpen, setIsDateSelectorOpen] = useState(false);
    
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Custom Date Range State
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    
    // Filtering Logic
    const { filteredData, startDate, endDate } = useMemo(() => {
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

        let filtered = [...data];
        if (start) {
            filtered = filtered.filter(tx => {
                const txDate = new Date(tx.Date + 'T00:00:00');
                return txDate >= start! && txDate <= end;
            });
        }
        
        return {
            filteredData: filtered.sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime()),
            startDate: start,
            endDate: end
        };
    }, [data, filter, customStart, customEnd]);

    const dateRangeString = useMemo(() => {
        if (filter === 'All') return 'All Time';
        if (filter === 'Custom' && (!startDate || !endDate)) return 'Select Dates';
        if (!startDate) return 'All Time';
        const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
        return `${startDate.toLocaleDateString('en-US', opts)} - ${endDate.toLocaleDateString('en-US', opts)}`;
    }, [startDate, endDate, filter]);

    // Dashboard Totals Calculation
    const dashboardStats = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const calc = (s: Date) => data
            .filter(tx => new Date(tx.Date + 'T00:00:00') >= s)
            .reduce((sum, t) => sum + normalizeAmount(t.Amount), 0);
        
        return {
            day: calc(today),
            week: calc(startOfWeek),
            month: calc(startOfMonth)
        };
    }, [data]);

    const handleDelete = async (id: string) => {
        if (!id) return;
        if (window.confirm("Are you sure you want to delete this transaction?")) {
            const colName = collectionNameForView(type);
            await deleteDoc(doc(db, `artifacts/default-app-id/users/${userId}/${colName}`, id));
        }
    };

    // Download Handlers
    const downloadCSV = () => {
        const headers = ["Reference No.", "Recipient", "Amount", "Date", "Time", "Payment Method", "Bank"];
        const rows = filteredData.map(tx => [
            `"${tx["Reference No."]}"`,
            `"${tx.Recipient}"`,
            normalizeAmount(tx.Amount).toFixed(2),
            tx.Date,
            tx.Time,
            tx["Payment Method"],
            tx.Bank
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${type}_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsDownloadOpen(false);
    };

    const downloadPDF = () => {
        const doc = new jsPDF();
        const reportTitle = type === 'sales' ? 'Sales Report' : 'Expense Report';
        const fileName = `${type}_report_${new Date().toISOString().split('T')[0]}.pdf`;

        const primaryColor = type === 'sales' ? [37, 99, 235] : [220, 38, 38]; 
        const alternateRowColor = type === 'sales' ? [239, 246, 255] : [254, 242, 242]; 

        doc.setFontSize(20);
        doc.setTextColor(0, 0, 0);
        doc.text("FinDash", 14, 20);
        
        doc.setFontSize(16);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(reportTitle, 14, 30);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 38);
        doc.text(`Period: ${dateRangeString}`, 14, 43);

        const totalAmount = filteredData.reduce((sum, item) => sum + normalizeAmount(item.Amount), 0);
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(`Total ${type === 'sales' ? 'Sales' : 'Expenses'}: PHP ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, 52);
        doc.text(`Total Transactions: ${filteredData.length}`, 14, 58);

        const tableColumn = ["Date", "Ref No.", "Recipient", "Method", "Bank", "Amount"];
        const tableRows = filteredData.map(tx => [
            formatDateForDisplay(tx.Date),
            tx["Reference No."],
            tx.Recipient,
            tx["Payment Method"],
            tx.Bank,
            normalizeAmount(tx.Amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 65,
            theme: 'striped',
            headStyles: { 
                fillColor: primaryColor as [number, number, number],
                textColor: [255, 255, 255],
                fontStyle: 'bold'
            },
            styles: { fontSize: 9, cellPadding: 3 },
            alternateRowStyles: { fillColor: alternateRowColor as [number, number, number] },
            columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } }
        });

        doc.save(fileName);
        setIsDownloadOpen(false);
    };

    const downloadExcel = () => {
        const dataForExcel = filteredData.map(tx => ({
            "Date": tx.Date,
            "Time": tx.Time,
            "Reference No.": tx["Reference No."],
            "Recipient": tx.Recipient,
            "Payment Method": tx["Payment Method"],
            "Bank": tx.Bank,
            "Amount": normalizeAmount(tx.Amount)
        }));

        const totalAmount = dataForExcel.reduce((sum, item) => sum + item.Amount, 0);
        dataForExcel.push({
            "Date": "TOTAL",
            "Time": "",
            "Reference No.": "",
            "Recipient": "",
            "Payment Method": "",
            "Bank": "",
            "Amount": totalAmount
        });

        const ws = XLSX.utils.json_to_sheet(dataForExcel);
        const headerColor = type === 'sales' ? "2563EB" : "DC2626"; 
        const headerStyle = {
            fill: { fgColor: { rgb: headerColor } },
            font: { color: { rgb: "FFFFFF" }, bold: true },
            alignment: { horizontal: "center" }
        };
        
        const range = XLSX.utils.decode_range(ws['!ref']!);
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_address = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cell_address]) continue;
                if (R === 0) ws[cell_address].s = headerStyle;
                else if (R === range.e.r) ws[cell_address].s = { font: { bold: true }, fill: { fgColor: { rgb: "E5E7EB" } } };
            }
        }
        ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, type === 'sales' ? "Sales" : "Expenses");
        XLSX.writeFile(wb, `${type}_report_${new Date().toISOString().split('T')[0]}.xlsx`);
        setIsDownloadOpen(false);
    };

    const textColor = type === 'sales' ? 'text-blue-400' : 'text-red-400';
    const title = type === 'sales' ? 'Sales History' : 'Expense History';
    const summaryTitle = type === 'sales' ? 'Sales Summary' : 'Expense Summary';

    return (
        <div className="flex flex-col h-auto lg:h-full pb-10">
            <div className="flex items-center justify-between mb-6 hidden md:flex">
                <h2 className="text-2xl font-bold text-white">{title}</h2>
                <button 
                    onClick={() => setIsExpanded(true)}
                    className="hidden lg:flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition-all"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    Expand View
                </button>
            </div>

            <div className="bg-[#1c1c1e] p-4 sm:p-6 rounded-[1.5rem] mb-4 sm:mb-6 border border-white/5 shadow-xl relative z-20">
                <div className="mb-4 sm:mb-6 relative">
                    <label className="text-[10px] sm:text-xs font-semibold text-gray-500 mb-1 sm:mb-2 block">Date Range</label>
                    <button 
                        onClick={() => setIsDateSelectorOpen(true)}
                        className="w-full bg-[#2c2c2e] hover:bg-[#3a3a3c] border border-white/10 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between text-gray-200 transition-colors group"
                    >
                        <span className="font-medium text-xs sm:text-sm truncate mr-2">{dateRangeString}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </button>
                    
                    {isDateSelectorOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setIsDateSelectorOpen(false)}>
                             <div className="bg-[#1c1c1e] border border-white/10 rounded-[2rem] shadow-2xl w-full max-w-sm p-6 relative animate-in zoom-in-95 slide-in-from-bottom-5 duration-200" onClick={e => e.stopPropagation()}>
                                 <button onClick={() => setIsDateSelectorOpen(false)} className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                                 <div className="text-center mb-8">
                                     <h3 className="text-xl font-bold text-white">Select Period</h3>
                                     <p className="text-xs text-gray-500 mt-1">Filter transactions by date</p>
                                 </div>
                                 <div className="flex flex-col gap-2 relative">
                                    <div className="absolute left-7 top-10 bottom-10 w-0.5 bg-white/5 z-0"></div>
                                     <div className="bg-black/40 p-1 rounded-2xl border border-white/5 relative z-10 group focus-within:border-blue-500/50 transition-colors">
                                        <div className="px-4 py-3">
                                             <label className="text-[10px] uppercase text-blue-400 font-bold mb-1 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>Start Date</label>
                                             <div className="relative"><input type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setFilter('Custom'); }} className="w-full bg-transparent border-none p-0 pl-8 text-white focus:ring-0 outline-none font-bold text-base h-8 [color-scheme:dark]" /><svg className="w-5 h-5 text-gray-500 absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                                         </div>
                                     </div>
                                     <div className="flex items-center justify-center -my-4 z-20 relative pointer-events-none"><div className="bg-[#2c2c2e] rounded-full p-1 border border-white/10 shadow-lg"><svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7" /></svg></div></div>
                                     <div className="bg-black/40 p-1 rounded-2xl border border-white/5 relative z-10 group focus-within:border-purple-500/50 transition-colors">
                                        <div className="px-4 py-3">
                                             <label className="text-[10px] uppercase text-purple-400 font-bold mb-1 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></div>End Date</label>
                                             <div className="relative"><input type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setFilter('Custom'); }} className="w-full bg-transparent border-none p-0 pl-8 text-white focus:ring-0 outline-none font-bold text-base h-8 [color-scheme:dark]" /><svg className="w-5 h-5 text-gray-500 absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                                         </div>
                                     </div>
                                 </div>
                                 <div className="mt-8 space-y-3">
                                     <button onClick={() => setIsDateSelectorOpen(false)} className="w-full bg-white text-black font-bold py-4 rounded-xl shadow-lg hover:bg-gray-200 transition-all active:scale-95">Apply Range</button>
                                     <button onClick={() => { setFilter('All'); setCustomStart(''); setCustomEnd(''); setIsDateSelectorOpen(false); }} className="w-full bg-transparent text-gray-500 font-semibold py-2 rounded-xl hover:text-white transition-all text-xs">Clear / Show All</button>
                                 </div>
                             </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-2 sm:gap-4 mb-6 sm:mb-8">
                    <div className="relative flex-1">
                        <button onClick={() => { setIsFilterOpen(!isFilterOpen); setIsDownloadOpen(false); setIsDateSelectorOpen(false); }} className="w-full bg-[#2c2c2e] hover:bg-[#3a3a3c] border border-white/10 text-gray-200 font-semibold py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl flex items-center justify-between text-xs sm:text-sm transition-all"><span className="truncate mr-1">{filter}</span><svg className={`w-3 h-3 sm:w-4 sm:h-4 text-gray-500 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg></button>
                        {isFilterOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-[#2c2c2e] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden">
                                {['Today', 'This Week', 'This Month', 'All'].map((f) => (
                                    <button key={f} onClick={() => { setFilter(f as any); setIsFilterOpen(false); if (f === 'All') { setCustomStart(''); setCustomEnd(''); }}} className="w-full text-left px-4 py-3 text-xs sm:text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5 last:border-0">{f}</button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="relative flex-1">
                        <button onClick={() => { setIsDownloadOpen(true); setIsFilterOpen(false); setIsDateSelectorOpen(false); }} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl flex items-center justify-between text-xs sm:text-sm transition-all shadow-lg shadow-blue-900/20">
                            <div className="flex items-center gap-1.5 sm:gap-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg><span>Download</span></div>
                        </button>
                        {isDownloadOpen && (
                             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setIsDownloadOpen(false)}>
                                 <div className="bg-[#1c1c1e] border border-white/10 rounded-[2rem] shadow-2xl w-full max-w-sm p-6 relative animate-in zoom-in-95 slide-in-from-bottom-5 duration-200" onClick={e => e.stopPropagation()}>
                                    <button onClick={() => setIsDownloadOpen(false)} className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                                    <div className="text-center mb-8"><h3 className="text-xl font-bold text-white">Download Report</h3><p className="text-xs text-gray-500 mt-1">Select a format to export your {type}</p></div>
                                    <div className="space-y-3">
                                        <button onClick={downloadCSV} className="w-full bg-white/5 hover:bg-white/10 p-4 rounded-xl flex items-center justify-between group transition-all border border-white/5 hover:border-blue-500/30">
                                            <div className="flex items-center gap-4"><div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div><div className="text-left"><div className="font-bold text-white">CSV</div><div className="text-xs text-gray-500">Comma Separated Values</div></div></div><svg className="w-5 h-5 text-gray-600 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                        </button>
                                        <button onClick={downloadPDF} className="w-full bg-white/5 hover:bg-white/10 p-4 rounded-xl flex items-center justify-between group transition-all border border-white/5 hover:border-red-500/30">
                                            <div className="flex items-center gap-4"><div className="p-3 bg-red-500/10 text-red-400 rounded-lg group-hover:bg-red-500 group-hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg></div><div className="text-left"><div className="font-bold text-white">PDF</div><div className="text-xs text-gray-500">Portable Document Format</div></div></div><svg className="w-5 h-5 text-gray-600 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                        </button>
                                        <button onClick={downloadExcel} className="w-full bg-white/5 hover:bg-white/10 p-4 rounded-xl flex items-center justify-between group transition-all border border-white/5 hover:border-green-500/30">
                                            <div className="flex items-center gap-4"><div className="p-3 bg-green-500/10 text-green-400 rounded-lg group-hover:bg-green-500 group-hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg></div><div className="text-left"><div className="font-bold text-white">Excel</div><div className="text-xs text-gray-500">Spreadsheet (.xlsx)</div></div></div><svg className="w-5 h-5 text-gray-600 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                        </button>
                                    </div>
                                 </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t border-white/5 pt-3 sm:pt-4">
                    <h3 className="text-center text-gray-500 font-bold text-[8px] sm:text-[10px] mb-2 sm:mb-3 uppercase tracking-widest opacity-60">{summaryTitle}</h3>
                    <div className="grid grid-cols-3 gap-1 sm:gap-2 text-center">
                        <div className="flex flex-col items-center"><p className="text-[7px] sm:text-[9px] text-gray-500 font-bold uppercase mb-0.5">Today</p><p className={`text-xs sm:text-base font-black ${textColor} tracking-tight`}>{formatCurrency(dashboardStats.day)}</p></div>
                        <div className="border-l border-r border-white/5 flex flex-col items-center"><p className="text-[7px] sm:text-[9px] text-gray-500 font-bold uppercase mb-0.5">Week</p><p className={`text-xs sm:text-base font-black ${textColor} tracking-tight`}>{formatCurrency(dashboardStats.week)}</p></div>
                        <div className="flex flex-col items-center"><p className="text-[7px] sm:text-[9px] text-gray-500 font-bold uppercase mb-0.5">Month</p><p className={`text-xs sm:text-base font-black ${textColor} tracking-tight`}>{formatCurrency(dashboardStats.month)}</p></div>
                    </div>
                </div>
            </div>

            <div className="lg:flex-1 bg-[#1c1c1e] rounded-[2rem] border border-white/5 flex flex-col shadow-2xl min-h-0 w-full overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto custom-scrollbar pb-12 w-full">
                    <table className="w-full text-sm text-left whitespace-nowrap lg:whitespace-normal min-w-full">
                        <thead className="text-[10px] text-gray-400 uppercase font-bold bg-[#1c1c1e]/95 backdrop-blur-md border-b border-white/5 shadow-md">
                            <tr 
                                className="lg:cursor-pointer lg:hover:bg-white/5 transition-colors group/header"
                                onClick={() => {
                                    if (window.innerWidth >= 1024) {
                                        setIsExpanded(true);
                                    }
                                }}
                            >
                                <th className="px-5 sm:px-8 py-4 tracking-wider group-hover/header:text-blue-400 transition-colors">Reference</th>
                                <th className="px-5 sm:px-8 py-4 text-center tracking-wider group-hover/header:text-blue-400 transition-colors">Amount</th>
                                <th className="px-5 sm:px-8 py-4 text-right tracking-wider group-hover/header:text-blue-400 transition-colors">Date & Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="text-center py-20 sm:py-32">
                                        <div className="flex flex-col items-center justify-center px-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                            <div className="relative mb-6">
                                                <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full animate-pulse"></div>
                                                <div className="relative w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-b from-white/10 to-white/5 rounded-[2rem] flex items-center justify-center border border-white/10 shadow-2xl">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 sm:h-10 sm:w-10 text-blue-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                    </svg>
                                                </div>
                                            </div>
                                            
                                            <h3 className="text-white font-black text-xl sm:text-2xl tracking-tight mb-2">No {type} found</h3>
                                            <p className="text-gray-500 text-xs sm:text-sm max-w-[280px] mx-auto leading-relaxed mb-8">
                                                We couldn't find any records for this period. Try adjusting your filters or scanning a new receipt.
                                            </p>

                                            <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-[320px]">
                                                <button 
                                                    onClick={() => { setFilter('All'); setCustomStart(''); setCustomEnd(''); }}
                                                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                                                >
                                                    Show All Time
                                                </button>
                                                
                                                <button 
                                                    onClick={() => setIsExpanded(true)}
                                                    className="w-full py-3 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[9px] font-black uppercase tracking-widest rounded-2xl border border-white/5 transition-all flex items-center justify-center gap-2 active:scale-95"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                                    </svg>
                                                    Expand View
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map(tx => (
                                    <tr key={tx.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-5 sm:px-8 py-4 sm:py-5">
                                            <div className="font-bold text-white text-[11px] sm:text-sm leading-tight">{tx["Reference No."] || 'N/A'}</div>
                                            <div className="text-[9px] sm:text-[11px] text-gray-500 mt-0.5 truncate max-w-[100px] sm:max-w-[180px]">{tx.Recipient || 'Unknown Recipient'}</div>
                                            <div className="text-[8px] sm:text-[9px] text-blue-400/80 mt-1 inline-block font-bold bg-blue-400/5 px-1.5 py-0.5 rounded border border-blue-400/10 uppercase tracking-tighter">{tx["Payment Method"]}</div>
                                        </td>
                                        <td className="px-5 sm:px-8 py-4 sm:py-5 text-center">
                                            <span className={`font-black ${textColor} text-xs sm:text-base tracking-tight`}>{formatCurrency(tx.Amount)}</span>
                                        </td>
                                        <td className="px-5 sm:px-8 py-4 sm:py-5 text-right">
                                            <div className="text-gray-300 font-bold text-[10px] sm:text-xs">{formatDateForDisplay(tx.Date)}</div>
                                            <div className="text-[9px] sm:text-[11px] text-gray-600 mt-0.5 font-mono">{tx.Time || '--:--'}</div>
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(tx.id!); }} className="mt-1 text-[8px] sm:text-[9px] text-red-500/70 hover:text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all uppercase font-black tracking-widest">Delete</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Expanded Modal View (Desktop Only) */}
            {isExpanded && (
                <div className="fixed inset-0 z-[100] hidden lg:flex flex-col bg-[#141414] animate-in fade-in duration-200">
                    <div className="w-full h-full flex flex-col overflow-hidden">
                        <div className="px-8 py-6 border-b border-white/5 bg-[#1c1c1e] flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-black text-white tracking-tight">{title}</h2>
                                <p className="text-gray-500 text-sm mt-1">Full detailed view of your {type}.</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-xs font-bold text-gray-500 bg-black/40 px-4 py-2 rounded-full border border-white/5">{filteredData.length} Records Found</span>
                                <button 
                                    onClick={() => setIsExpanded(false)}
                                    className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-colors group"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#1c1c1e]">
                            <table className="w-full text-base text-left">
                                <thead className="text-xs text-gray-400 uppercase font-bold bg-[#1c1c1e]/90 backdrop-blur-sm border-b border-white/5 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-8 py-5 tracking-wider">Reference</th>
                                        <th className="px-8 py-4 tracking-wider">Recipient</th>
                                        <th className="px-8 py-4 tracking-wider">Method</th>
                                        <th className="px-8 py-4 tracking-wider">Bank</th>
                                        <th className="px-8 py-4 text-center tracking-wider">Amount</th>
                                        <th className="px-8 py-4 text-right tracking-wider">Date & Time</th>
                                        <th className="px-8 py-4"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredData.map(tx => (
                                        <tr key={tx.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-8 py-6">
                                                <div className="font-bold text-white text-base">{tx["Reference No."] || 'N/A'}</div>
                                            </td>
                                            <td className="px-8 py-6 text-gray-500 text-sm">{tx.Recipient || 'N/A'}</td>
                                            <td className="px-8 py-6">
                                                <span className="text-blue-400 bg-blue-400/10 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider">{tx["Payment Method"]}</span>
                                            </td>
                                            <td className="px-8 py-6 text-gray-500 text-sm">{tx.Bank || 'N/A'}</td>
                                            <td className="px-8 py-6 text-center">
                                                <span className={`font-black ${textColor} text-xl`}>{formatCurrency(tx.Amount)}</span>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <div className="text-gray-300 font-bold text-base">{formatDateForDisplay(tx.Date)}</div>
                                                <div className="text-sm text-gray-600 font-mono mt-1">{tx.Time || '--:--'}</div>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <button onClick={() => handleDelete(tx.id!)} className="text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-500/10 rounded-full">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="p-6 border-t border-white/5 bg-[#1c1c1e] flex justify-end gap-4">
                            <button 
                                onClick={() => setIsExpanded(false)}
                                className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all"
                            >
                                Close
                            </button>
                            <button 
                                onClick={() => { setIsExpanded(false); setIsDownloadOpen(true); }}
                                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all"
                            >
                                Export Data
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransactionList;