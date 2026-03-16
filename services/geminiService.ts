import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "AIzaSyC28MimC7FkljPUpPBrwM41ed79SP5OHX8" });

const modelName = 'gemini-2.5-flash';

export const scanReceiptImage = async (base64Data: string): Promise<any> => {
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    { text: "You are an expert financial data extractor. Your task is to extract transaction details from an image. The image could be a formal printed receipt, a digital invoice, or a HANDWRITTEN NOTE/LEDGER. You are highly skilled at deciphering difficult handwriting, cursive, and shorthand. Extract the following details: Reference Number, Recipient Name, Total Amount, Transaction Date (YYYY-MM-DD), Transaction Time (HH:MM AM/PM), Payment Method (must be one of: 'GCash', 'BPI', 'Bank Transfer', 'Other'), and Bank Name (if 'Bank Transfer', try to find the bank like 'BPI', 'BDO', etc.). Respond with ONLY a single, minified JSON object. Do not include any other text, explanations, or markdown formatting. The JSON object must have these exact keys: 'reference', 'recipient', 'amount', 'date', 'time', 'paymentMethod', 'bank'. If a value cannot be found for any key, use the string 'N/A'. The 'amount' should be a string (e.g., '₱1,234.56'), and 'date' must be in YYYY-MM-DD format." },
                    { 
                        inlineData: { 
                            mimeType: "image/jpeg", 
                            data: base64Data 
                        } 
                    }
                ]
            },
            config: {
                responseMimeType: "application/json"
            }
        });

        const text = response.text;
        if (!text) throw new Error("No content from API");
        return JSON.parse(text);
    } catch (error) {
        console.error("Gemini Scan Error:", error);
        throw error;
    }
};

export const scanBankHistoryImage = async (base64Data: string): Promise<any[]> => {
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    { text: "You are an expert bank statement scanner. Analyze the provided transaction history screenshot (e.g., from GCash, BPI, BDO). Extract *all* individual transactions you can find. For each transaction, extract the 'Date' (use YYYY-MM-DD format if possible), 'Description' (or 'Recipient'), 'Amount', and 'Reference' (Ref No., Trace ID, etc., if visible). The Amount MUST be a string and MUST include a '+' for credit/deposits and a '-' for debit/withdrawals (e.g., '+117.00', '-27.00'). Respond with ONLY a single, minified JSON array, where each object has keys: 'date', 'description', 'amount', 'reference'. If a value is missing, use 'N/A'." },
                    { 
                        inlineData: { 
                            mimeType: "image/jpeg", 
                            data: base64Data 
                        } 
                    }
                ]
            },
            config: {
                responseMimeType: "application/json"
            }
        });

        const text = response.text;
        if (!text) throw new Error("No content from API");
        return JSON.parse(text);
    } catch (error) {
        console.error("Gemini Bank Scan Error:", error);
        throw error;
    }
};

export const generateInsights = async (totalSales: number, totalExpenses: number, grossProfit: number, bankBalances: Record<string, number>): Promise<string> => {
    try {
        const systemPrompt = "You are a small business owner who needs to make more informed business decisions based on financial insights. Based on this summary data, generate exactly 3 concise, actionable bullet-point insights for the user. Do not add any introductory or concluding text, just the 3 bullet points. Start each point with '• '.";
        const userQuery = `My financial summary is: Total Sales: ${totalSales}, Total Expenses: ${totalExpenses}, Gross Profit: ${grossProfit}. My net balance per payment method is: ${JSON.stringify(bankBalances)}. Generate 3 insights.`;

        const response = await ai.models.generateContent({
            model: modelName,
            contents: [
                { role: "user", parts: [{ text: userQuery }] }
            ],
            config: {
                systemInstruction: systemPrompt
            }
        });

        const text = response.text;
        if (!text) throw new Error("No insights returned");
        
        // Format as HTML list
        return '<ul>' + text.split('• ').filter(item => item.trim() !== '').map(item => `<li>${item.trim()}</li>`).join('') + '</ul>';
    } catch (error) {
        console.error("Gemini Insights Error:", error);
        throw error;
    }
};

export const createFinancialChat = (systemContext: string) => {
    return ai.chats.create({
        model: modelName,
        config: {
            systemInstruction: systemContext
        }
    });
};