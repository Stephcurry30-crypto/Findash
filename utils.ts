export function normalizeAmount(amount: string | number): number {
    if (typeof amount === 'number') return amount;
    return parseFloat(String(amount).replace(/[^0-9.-]+/g, "")) || 0;
}

export function formatCurrency(amount: number | string): string {
    const num = typeof amount === 'string' ? normalizeAmount(amount) : amount;
    return num.toLocaleString('en-PH', {
        style: 'currency', 
        currency: 'PHP', 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2
    });
}

export function collectionNameForView(view: 'sales' | 'expenses'): string {
    return view === 'sales' ? 'transactions' : 'expenses';
}

export function formatDateForDisplay(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}