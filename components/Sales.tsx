import React from 'react';
import Scanner from './Scanner';
import TransactionList from './TransactionList';
import { Transaction } from '../types';

interface SalesProps {
    userId: string;
    data: Transaction[];
    onSaveSuccess: () => void;
    droppedFiles?: File[];
    onFilesProcessed?: () => void;
}

const Sales: React.FC<SalesProps> = ({ userId, data, onSaveSuccess, droppedFiles, onFilesProcessed }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 lg:gap-8 h-full fade-in overflow-hidden pr-1 custom-scrollbar">
            <div className="md:col-span-4 lg:col-span-3 h-auto md:h-full">
                <Scanner 
                    userId={userId} 
                    type="sales" 
                    onSaveSuccess={onSaveSuccess} 
                    externalFiles={droppedFiles}
                    onExternalFilesProcessed={onFilesProcessed}
                />
            </div>
            <div className="md:col-span-8 lg:col-span-9 flex flex-col min-h-0 h-full">
                <TransactionList 
                    userId={userId}
                    data={data} 
                    type="sales" 
                />
            </div>
        </div>
    );
};

export default Sales;
