
import React, { useState, useRef, useEffect } from 'react';
import { scanReceiptImage } from '../services/geminiService';
import { Transaction } from '../types';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { collectionNameForView } from '../utils';

interface ScannerProps {
    userId: string;
    type: 'sales' | 'expenses';
    onSaveSuccess: () => void;
    externalFiles?: File[];
    onExternalFilesProcessed?: () => void;
}

const Scanner: React.FC<ScannerProps> = ({ userId, type, onSaveSuccess, externalFiles, onExternalFilesProcessed }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [scannedItems, setScannedItems] = useState<Transaction[]>([]);
    const [cameraActive, setCameraActive] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [error, setError] = useState('');
    
    // Track file counts for "Scanning X of Y"
    const [currentFileIndex, setCurrentFileIndex] = useState(0);
    const [totalFiles, setTotalFiles] = useState(0);
    
    const singleFileRef = useRef<HTMLInputElement>(null);
    const multipleFileRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Effect to handle external dropped files
    useEffect(() => {
        if (externalFiles && externalFiles.length > 0) {
            processFiles(externalFiles);
            if (onExternalFilesProcessed) {
                onExternalFilesProcessed();
            }
        }
    }, [externalFiles]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setShowDropdown(false);
        processFiles(Array.from(files));
        e.target.value = '';
    };

    const processFiles = async (files: File[]) => {
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) {
            setError("No image files found.");
            return;
        }
        
        setIsScanning(true);
        setTotalFiles(imageFiles.length);
        setCurrentFileIndex(0);
        setScannedItems([]);
        setError('');
        
        let completedCount = 0;
        
        try {
            const scanPromises = imageFiles.map(async (file) => {
                try {
                    const base64 = await readFileAsBase64(file);
                    const rawBase64 = base64.split(',')[1];
                    const data = await scanReceiptImage(rawBase64);
                    
                    completedCount++;
                    setCurrentFileIndex(completedCount);
                    setProgress((completedCount / imageFiles.length) * 100);
                    
                    const paymentMethod = data.paymentMethod === 'Bank Transfer' && data.bank !== 'N/A' ? data.bank : (data.paymentMethod || 'Other');
                    const bank = (paymentMethod !== 'Other' && data.bank === 'N/A') ? paymentMethod : (data.bank || 'N/A');
                    
                    return {
                        "Reference No.": data.reference || 'N/A',
                        Recipient: data.recipient || 'N/A',
                        Amount: data.amount || '0.00',
                        Date: data.date || new Date().toISOString().split('T')[0],
                        Time: data.time || '',
                        "Payment Method": paymentMethod,
                        Bank: bank,
                        type: type
                    } as Transaction;
                } catch (err) {
                    console.error(`Error scanning file ${file.name}:`, err);
                    completedCount++;
                    setCurrentFileIndex(completedCount);
                    setProgress((completedCount / imageFiles.length) * 100);
                    return null;
                }
            });

            const results = await Promise.all(scanPromises);
            const newItems = results.filter((item): item is Transaction => item !== null);

            if (newItems.length === 0) {
                setError("Failed to extract data from any of the images.");
                setIsScanning(false);
                return;
            }

            setTimeout(() => {
                setScannedItems(newItems);
                setIsScanning(false);
                setProgress(0);
                setCurrentFileIndex(0);
                setTotalFiles(0);
                setShowReviewModal(true);
            }, 500);
        } catch (err) {
            console.error("Batch processing error:", err);
            setError("An unexpected error occurred during processing.");
            setIsScanning(false);
        }
    };

    const readFileAsBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const startCamera = async () => {
        setError('');
        setShowDropdown(false);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            streamRef.current = stream;
            setCameraActive(true);
            setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 100);
        } catch (err) {
            setError("Camera access denied.");
        }
    };

    const stopCamera = () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setCameraActive(false);
    };

    const captureImage = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
        canvas.toBlob(blob => {
            if (blob) {
                const file = new File([blob], "captured.jpg", { type: "image/jpeg" });
                stopCamera();
                processFiles([file]);
            }
        }, 'image/jpeg');
    };

    const handleUpdateItem = (index: number, field: keyof Transaction, value: string) => {
        const updated = [...scannedItems];
        updated[index] = { ...updated[index], [field]: value };
        setScannedItems(updated);
    };

    const handleRemoveItem = (index: number) => {
        const updated = scannedItems.filter((_, i) => i !== index);
        setScannedItems(updated);
        if (updated.length === 0) setShowReviewModal(false);
    };

    const saveItems = async () => {
        if (scannedItems.length === 0) return;
        const batch = writeBatch(db);
        const colRef = collection(db, `artifacts/default-app-id/users/${userId}/${collectionNameForView(type)}`);
        scannedItems.forEach(item => batch.set(doc(colRef), item));
        await batch.commit();
        setScannedItems([]);
        setShowReviewModal(false);
        onSaveSuccess();
    };

    return (
        <div className={`flex flex-col h-full w-full relative pb-10 ${isScanning ? 'justify-center' : ''}`}>
            {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-xs text-center flex-none mb-4">{error}</div>}

            {/* Standard Upload UI (Hidden while scanning or camera active) */}
            {!isScanning && !cameraActive && (
                <div className="flex-1 flex flex-col min-h-[250px] lg:min-h-0">
                    <div 
                        className="flex-1 bg-[#1c1c1e] rounded-[1.5rem] sm:rounded-[2rem] border-2 border-dashed border-gray-600 hover:border-blue-500 transition-all duration-300 group flex flex-col items-center justify-center p-4 sm:p-8 text-center cursor-pointer shadow-lg"
                        onClick={() => multipleFileRef.current?.click()}
                    >
                        <div className="bg-gray-800 p-3 sm:p-5 rounded-full mb-4 sm:mb-6 group-hover:bg-blue-600 transition-all duration-300 shadow-xl">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-10 sm:w-10 text-gray-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                        </div>
                        <div className="flex flex-col items-center justify-center w-full">
                            <h3 className="text-base sm:text-xl font-bold text-gray-200 mb-1 sm:mb-2 group-hover:text-blue-200 transition-colors">Tap to upload receipts</h3>
                            <p className="text-gray-500 text-[10px] sm:text-sm">Supports photos & handwritten notes</p>
                        </div>
                    </div>
                    
                    <div className="mt-12 relative">
                        <div className="flex items-center gap-3 mb-6 px-4">
                            <div className="h-px bg-white/10 flex-1"></div>
                            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">OR</h4>
                            <div className="h-px bg-white/10 flex-1"></div>
                        </div>
                        
                        <button 
                            onClick={() => setShowDropdown(!showDropdown)}
                            className="w-full bg-blue-600 hover:bg-blue-700 p-4 rounded-full flex items-center justify-center gap-2 font-bold text-white transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                            Add Receipt/Invoice
                        </button>

                        {showDropdown && (
                            <div className="absolute bottom-full mb-4 w-full bg-[#1c1c1e] border border-white/10 rounded-[1.5rem] shadow-2xl z-20 p-2 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 grid grid-cols-4 gap-2">
                                <button onClick={() => singleFileRef.current?.click()} className="flex flex-col items-center justify-center p-3 hover:bg-white/5 rounded-xl transition-colors group">
                                    <div className="p-3 bg-blue-500/10 text-blue-400 rounded-full mb-2 group-hover:bg-blue-500 group-hover:text-white transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                                    <span className="text-xs font-semibold text-gray-300 group-hover:text-white text-center leading-tight">Single Photo</span>
                                </button>
                                <button onClick={() => multipleFileRef.current?.click()} className="flex flex-col items-center justify-center p-3 hover:bg-white/5 rounded-xl transition-colors group">
                                    <div className="p-3 bg-purple-500/10 text-purple-400 rounded-full mb-2 group-hover:bg-purple-500 group-hover:text-white transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></div>
                                    <span className="text-xs font-semibold text-gray-300 group-hover:text-white text-center leading-tight">Multiple Photos</span>
                                </button>
                                <button onClick={() => folderInputRef.current?.click()} className="flex flex-col items-center justify-center p-3 hover:bg-white/5 rounded-xl transition-colors group">
                                    <div className="p-3 bg-yellow-500/10 text-yellow-400 rounded-full mb-2 group-hover:bg-yellow-500 group-hover:text-white transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg></div>
                                    <span className="text-xs font-semibold text-gray-300 group-hover:text-white text-center leading-tight">Upload Folder</span>
                                </button>
                                <button onClick={startCamera} className="flex flex-col items-center justify-center p-3 hover:bg-white/5 rounded-xl transition-colors group">
                                    <div className="p-3 bg-red-500/10 text-red-400 rounded-full mb-2 group-hover:bg-red-500 group-hover:text-white transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg></div>
                                    <span className="text-xs font-semibold text-gray-300 group-hover:text-white text-center leading-tight">Use Camera</span>
                                </button>
                            </div>
                        )}
                    </div>

                    <input type="file" ref={singleFileRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                    <input type="file" ref={multipleFileRef} className="hidden" multiple accept="image/*" onChange={handleFileUpload} />
                    <input 
                        type="file" 
                        ref={folderInputRef} 
                        className="hidden" 
                        {...({ webkitdirectory: "true", directory: "true" } as any)} 
                        multiple 
                        onChange={handleFileUpload} 
                    />
                </div>
            )}

            {cameraActive && (
                <div className="fixed inset-0 z-[150] bg-black flex flex-col items-center justify-center animate-in fade-in duration-300">
                    {/* Camera Viewport */}
                    <div className="relative w-full h-full max-w-4xl max-h-[80vh] sm:rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl">
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            className="w-full h-full object-cover bg-black"
                        ></video>
                        
                        {/* Viewfinder Overlay */}
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                            <div className="w-4/5 h-3/5 border-2 border-white/20 rounded-3xl relative">
                                {/* Corners */}
                                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg"></div>
                                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg"></div>
                                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg"></div>
                                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg"></div>
                                
                                {/* Center Crosshair */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4">
                                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white/30"></div>
                                    <div className="absolute left-1/2 top-0 w-0.5 h-full bg-white/30"></div>
                                </div>
                            </div>
                        </div>

                        {/* Camera Status Bar */}
                        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                                <span className="text-white text-[10px] font-black uppercase tracking-[0.2em]">Live Camera</span>
                            </div>
                            <button 
                                onClick={stopCamera}
                                className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-md"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* Camera Controls */}
                    <div className="w-full max-w-4xl p-8 flex items-center justify-around bg-black">
                        <button 
                            onClick={stopCamera}
                            className="text-gray-400 hover:text-white font-bold text-sm uppercase tracking-widest transition-colors"
                        >
                            Cancel
                        </button>
                        
                        {/* Shutter Button */}
                        <button 
                            onClick={captureImage}
                            className="relative group active:scale-90 transition-transform"
                        >
                            <div className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1">
                                <div className="w-full h-full rounded-full bg-white group-hover:bg-gray-200 transition-colors"></div>
                            </div>
                        </button>

                        <div className="w-12"></div> {/* Spacer for balance */}
                    </div>
                </div>
            )}

            {isScanning && (
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
                                Processing {currentFileIndex} of {totalFiles}
                            </h3>
                            <p className="text-gray-400 text-sm font-medium">
                                Gemini AI is extracting transaction data...
                            </p>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-3">
                            <div className="flex justify-between text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                <span>Progress</span>
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
            )}

            {/* REVIEW MODAL */}
            {showReviewModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
                    <div className="bg-[#1c1c1e] w-full max-w-5xl h-full max-h-[95vh] sm:max-h-[90vh] rounded-[1.5rem] sm:rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col relative overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="px-4 py-4 sm:px-8 sm:py-6 border-b border-white/5 bg-white/5 backdrop-blur-xl flex justify-between items-center z-10">
                            <div>
                                <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight">Review Extraction</h2>
                                <p className="text-gray-400 text-[10px] sm:text-sm mt-0.5 sm:mt-1">Found {scannedItems.length} items. Edit before saving.</p>
                            </div>
                            <button 
                                onClick={() => setShowReviewModal(false)}
                                className="p-2 sm:p-3 bg-white/5 hover:bg-white/10 rounded-full transition-colors group"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Modal Body - Scrollable Form List */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 bg-black/20">
                            <div className="grid grid-cols-1 gap-4 sm:gap-6">
                                {scannedItems.map((tx, idx) => (
                                    <div key={idx} className="bg-[#2c2c2e] rounded-[1.5rem] sm:rounded-[2rem] border border-white/5 hover:border-blue-500/30 transition-all shadow-lg overflow-hidden group relative">
                                        {/* Card Header */}
                                        <div className="px-4 py-3 sm:px-6 sm:py-4 bg-white/5 border-b border-white/5 flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black text-white shadow-lg shadow-blue-600/20">
                                                    {idx + 1}
                                                </div>
                                                <h4 className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest">Transaction Proof</h4>
                                            </div>
                                            <button 
                                                onClick={() => handleRemoveItem(idx)}
                                                className="p-1.5 sm:p-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg transition-all group/del"
                                                title="Remove Item"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="p-4 sm:p-6">
                                            <div className="grid grid-cols-2 md:grid-cols-12 gap-4 sm:gap-6">
                                                {/* Date & Time - 2 columns on mobile, 3 on desktop */}
                                                <div className="col-span-1 md:col-span-3 space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-tighter flex items-center gap-1.5">
                                                        <div className="w-1 h-1 rounded-full bg-blue-500"></div>
                                                        Date
                                                    </label>
                                                    <input 
                                                        type="date" 
                                                        value={tx.Date}
                                                        onChange={(e) => handleUpdateItem(idx, 'Date', e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none [color-scheme:dark] transition-all"
                                                    />
                                                </div>
                                                <div className="col-span-1 md:col-span-3 space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-tighter flex items-center gap-1.5">
                                                        <div className="w-1 h-1 rounded-full bg-purple-500"></div>
                                                        Time
                                                    </label>
                                                    <input 
                                                        type="text" 
                                                        value={tx.Time}
                                                        onChange={(e) => handleUpdateItem(idx, 'Time', e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all"
                                                        placeholder="HH:MM AM/PM"
                                                    />
                                                </div>

                                                {/* Amount - 2 columns on mobile, 3 on desktop */}
                                                <div className="col-span-2 md:col-span-3 space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-tighter flex items-center gap-1.5">
                                                        <div className="w-1 h-1 rounded-full bg-green-500"></div>
                                                        Amount
                                                    </label>
                                                    <div className="relative">
                                                        <input 
                                                            type="text" 
                                                            value={tx.Amount}
                                                            onChange={(e) => handleUpdateItem(idx, 'Amount', e.target.value)}
                                                            className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-green-400 font-black text-sm sm:text-base focus:border-green-500 focus:ring-1 focus:ring-green-500/20 outline-none transition-all"
                                                        />
                                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-[10px] font-bold pointer-events-none">₱</div>
                                                    </div>
                                                </div>

                                                {/* Reference - 2 columns on mobile, 3 on desktop */}
                                                <div className="col-span-2 md:col-span-3 space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-tighter flex items-center gap-1.5">
                                                        <div className="w-1 h-1 rounded-full bg-yellow-500"></div>
                                                        Ref No.
                                                    </label>
                                                    <input 
                                                        type="text" 
                                                        value={tx["Reference No."]}
                                                        onChange={(e) => handleUpdateItem(idx, 'Reference No.', e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-blue-300 font-mono text-xs sm:text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all"
                                                    />
                                                </div>

                                                {/* Recipient - Full width */}
                                                <div className="col-span-2 md:col-span-6 space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-tighter flex items-center gap-1.5">
                                                        <div className="w-1 h-1 rounded-full bg-white"></div>
                                                        Recipient / Description
                                                    </label>
                                                    <input 
                                                        type="text" 
                                                        value={tx.Recipient}
                                                        onChange={(e) => handleUpdateItem(idx, 'Recipient', e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all"
                                                        placeholder="Who received the payment?"
                                                    />
                                                </div>

                                                {/* Payment Method - 1 column on mobile, 3 on desktop */}
                                                <div className="col-span-1 md:col-span-3 space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-tighter flex items-center gap-1.5">
                                                        <div className="w-1 h-1 rounded-full bg-indigo-500"></div>
                                                        Method
                                                    </label>
                                                    <div className="relative">
                                                        <select 
                                                            value={tx["Payment Method"]}
                                                            onChange={(e) => handleUpdateItem(idx, 'Payment Method', e.target.value)}
                                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none appearance-none transition-all cursor-pointer"
                                                        >
                                                            <option>GCash</option>
                                                            <option>BPI</option>
                                                            <option>BDO</option>
                                                            <option>Cash</option>
                                                            <option>Bank Transfer</option>
                                                            <option>Other</option>
                                                        </select>
                                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Bank - 1 column on mobile, 3 on desktop */}
                                                <div className="col-span-1 md:col-span-3 space-y-1.5">
                                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-tighter flex items-center gap-1.5">
                                                        <div className="w-1 h-1 rounded-full bg-orange-500"></div>
                                                        Source
                                                    </label>
                                                    <input 
                                                        type="text" 
                                                        value={tx.Bank}
                                                        onChange={(e) => handleUpdateItem(idx, 'Bank', e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all"
                                                        placeholder="Personal/Business"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 sm:p-6 border-t border-white/5 bg-[#1c1c1e] z-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
                            <button 
                                onClick={() => { setScannedItems([]); setShowReviewModal(false); }}
                                className="flex-1 py-3 sm:py-4 rounded-xl font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 hover:text-red-300 transition-colors text-sm"
                            >
                                Discard All
                            </button>
                            <button 
                                onClick={saveItems} 
                                className="flex-[2] py-3 sm:py-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-2 sm:gap-3 active:scale-[0.98] text-sm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                <span>Save {scannedItems.length} Records</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Scanner;
