import React from 'react';

const SplashScreen: React.FC = () => {
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
            <div className="flex flex-col items-center space-y-6">
                <h1 className="text-6xl font-extrabold gradient-text animate-pulse">FinDash</h1>
                <div className="spinner !w-10 !h-10 !border-4"></div> 
                <p className="text-sm text-gray-400">Loading secure connection...</p>
            </div>
        </div>
    );
};

export default SplashScreen;