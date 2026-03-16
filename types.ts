export interface Transaction {
    id?: string;
    "Reference No.": string;
    Recipient: string;
    Amount: string; // Stored as currency string "₱1,234.56"
    Date: string; // YYYY-MM-DD
    Time: string; // HH:MM AM/PM
    "Payment Method": string;
    Bank: string;
    type?: 'sales' | 'expenses'; // Helper for recon
    matched?: boolean;
}

export type ViewState = 'sales' | 'expenses' | 'reconcile' | 'summary';

export interface BankTransaction {
    id: string;
    date: string;
    description: string;
    amount: number; // Float
    reference?: string | null; // Extracted reference number
    matched?: boolean;
    typeOverride?: 'sales' | 'expenses'; // User override for inferred type
}

export interface ReconcileMatch {
    bankTx: BankTransaction;
    matchingRecord: Transaction & { amount: number };
}