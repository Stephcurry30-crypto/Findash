import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { auth, db } from './services/firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, onSnapshot } from 'firebase/firestore';
import AuthModal from './components/AuthModal';
import SplashScreen from './components/SplashScreen';
import Expenses from './components/Expenses';
import Reconcile from './components/Reconcile';
import Summary from './components/Summary';
import Sales from './components/Sales';
import ProfileModal from './components/ProfileModal';
import Chatbot from './components/Chatbot';
import { Transaction, ViewState } from './types';

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [loadingAuth, setLoadingAuth] = useState(true);
    const [currentView, setCurrentView] = useState<ViewState>('sales');
    const [salesData, setSalesData] = useState<Transaction[]>([]);
    const [expensesData, setExpensesData] = useState<Transaction[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false); // State for logout modal
    const [droppedFiles, setDroppedFiles] = useState<File[]>([]);

    // Initial Auth Check
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            // Artificial delay for splash screen aesthetics
            setTimeout(() => setLoadingAuth(false), 800);
        });
        return () => unsubscribe();
    }, []);

    // Global Drag & Drop Listeners
    useEffect(() => {
        let dragCounter = 0;

        const handleDragEnter = (e: DragEvent) => {
            e.preventDefault();
            dragCounter++;
            if (dragCounter > 0) setIsDragOver(true);
        };

        const handleDragLeave = (e: DragEvent) => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter === 0) setIsDragOver(false);
        };

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
        };

        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            dragCounter = 0;
            setIsDragOver(false);
            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                setDroppedFiles(Array.from(e.dataTransfer.files));
            }
        };

        window.addEventListener('dragenter', handleDragEnter);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('drop', handleDrop);

        return () => {
            window.removeEventListener('dragenter', handleDragEnter);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('drop', handleDrop);
        };
    }, []);

    // Data Listeners
    useEffect(() => {
        if (!user) {
            setSalesData([]);
            setExpensesData([]);
            return;
        }

        const salesCol = collection(db, `artifacts/default-app-id/users/${user.uid}/transactions`);
        const expensesCol = collection(db, `artifacts/default-app-id/users/${user.uid}/expenses`);

        const unsubSales = onSnapshot(query(salesCol), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
            setSalesData(data);
        });

        const unsubExpenses = onSnapshot(query(expensesCol), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
            setExpensesData(data);
        });

        return () => {
            unsubSales();
            unsubExpenses();
        };
    }, [user]);

    const handleLogoutClick = () => {
        setShowLogoutConfirm(true);
    };

    const confirmLogout = () => {
        setShowLogoutConfirm(false);
        setLoadingAuth(true); // Show splash screen immediately
        
        setTimeout(async () => {
            try {
                await signOut(auth);
                setCurrentView('expenses');
            } catch (error) {
                console.error("Logout failed", error);
                setLoadingAuth(false);
            }
        }, 1000); // 1 second delay
    };

    const handleFilesProcessed = () => {
        setDroppedFiles([]);
    };

    if (loadingAuth) {
        return <SplashScreen />;
    }

    if (!user) {
        return <AuthModal />;
    }

    return (
        <div className="w-full max-w-7xl mx-auto transition-all duration-300 ease-in-out px-2 sm:px-4">
            {/* Profile Modal */}
            {showProfile && <ProfileModal user={user} onClose={() => setShowProfile(false)} />}

            {/* Logout Confirmation Modal */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 p-4">
                    <div className="bg-[#1c1c1e] w-full max-w-sm rounded-[2rem] border border-white/10 shadow-2xl p-6 text-center transform transition-all scale-100">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Log Out?</h3>
                        <p className="text-gray-400 text-sm mb-6">Are you sure you want to sign out of your account?</p>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setShowLogoutConfirm(false)}
                                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-colors border border-white/5"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={confirmLogout}
                                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-red-600/20"
                            >
                                Log Out
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Drag Overlay */}
            {isDragOver && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-blue-500/80 backdrop-blur-sm pointer-events-none text-white font-bold text-2xl animate-pulse">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    <span>Drop Files to Scan</span>
                </div>
            )}
            
            <Chatbot sales={salesData} expenses={expensesData} />

            <div className="apple-ui-card pt-3 sm:pt-6 px-3 sm:px-6 pb-0 rounded-t-2xl sm:rounded-t-[2rem] shadow-2xl shadow-blue-500/10 w-full relative md:overflow-hidden h-auto md:h-[85vh] md:mt-[7.5vh] flex flex-col">
                {/* User Bar */}
                <div className="flex items-center justify-between mb-3 sm:mb-4 shrink-0">
                    <button 
                        onClick={() => setShowProfile(true)}
                        className="flex items-center gap-2 sm:gap-3 bg-white/5 hover:bg-white/10 pr-3 sm:pr-4 pl-1 sm:pl-1.5 py-1 sm:py-1.5 rounded-full transition-all group border border-transparent hover:border-white/5"
                    >
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[10px] sm:text-xs font-bold text-white shadow-lg overflow-hidden relative">
                            {user.photoURL ? (
                                <img src={user.photoURL} alt="User Avatar" className="w-full h-full object-cover" />
                            ) : (
                                user.email?.[0].toUpperCase()
                            )}
                        </div>
                        <div className="flex flex-col items-start">
                            <span className="text-[10px] sm:text-xs font-bold text-gray-200 group-hover:text-white transition-colors max-w-[120px] sm:max-w-[150px] truncate">{user.email}</span>
                            <span className="text-[9px] sm:text-[10px] text-blue-400 group-hover:text-blue-300 transition-colors">Settings</span>
                        </div>
                    </button>
                    <button onClick={handleLogoutClick} className="text-xs sm:text-sm text-red-400 hover:text-red-300 font-semibold px-3 sm:px-4 py-1.5 sm:py-2 hover:bg-white/5 rounded-full transition-colors">Log Out</button>
                </div>

                {/* Navigation */}
                <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-700 mb-4 sm:mb-6 pb-1 shrink-0">
                     <header className="mb-2 md:mb-0">
                        <h1 className="text-2xl sm:text-3xl font-bold gradient-text text-center md:text-left">FinDash</h1>
                    </header>

                    <nav className="flex overflow-x-auto no-scrollbar justify-start md:justify-end gap-1.5 sm:gap-2 pb-1.5 md:pb-0">
                        {['sales', 'expenses', 'reconcile', 'summary'].map((view) => (
                            <button
                                key={view}
                                onClick={() => setCurrentView(view as ViewState)}
                                className={`whitespace-nowrap px-3 sm:px-3 py-1.5 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold capitalize transition-all ${
                                    currentView === view 
                                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                }`}
                            >
                                {view}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Main Content Area - key={currentView} forces a clean remount to fix layout glitches on switch */}
                <main className="flex-1 relative flex flex-col md:min-h-0 md:overflow-hidden h-auto overflow-y-auto md:overflow-y-hidden" key={currentView}>
                    
                    {currentView === 'sales' && (
                        <Sales 
                            userId={user.uid} 
                            data={salesData} 
                            onSaveSuccess={() => {}} 
                            droppedFiles={droppedFiles}
                            onFilesProcessed={handleFilesProcessed}
                        />
                    )}

                    {currentView === 'expenses' && (
                        <Expenses 
                            userId={user.uid} 
                            data={expensesData} 
                            onSaveSuccess={() => {}} 
                            droppedFiles={droppedFiles}
                            onFilesProcessed={handleFilesProcessed}
                        />
                    )}

                    {currentView === 'reconcile' && (
                        <Reconcile 
                            userId={user.uid} 
                            sales={salesData} 
                            expenses={expensesData} 
                            droppedFiles={droppedFiles}
                            onFilesProcessed={handleFilesProcessed}
                        />
                    )}

                    {currentView === 'summary' && (
                        <Summary sales={salesData} expenses={expensesData} />
                    )}
                </main>
            </div>
        </div>
    );
};

export default App;