import { CreditReport, Tradeline } from '../types';
import { vaultService } from '../services/vault';
import { v4 as uuidv4 } from 'uuid';

export const ingestionEngine = {
    async processUpload(rawText: string, metadata: { fileName: string, pageCount: number }): Promise<string> {
        console.log(`[Ingestion] Processing ${metadata.fileName}... Received ${rawText.length} chars.`);

        // PHASE 1: SECURE INTAKE VALIDATION
        if (rawText.length < 100) {
            throw new Error("Security Rejection: File content too short. Potential corrupted or malicious payload.");
        }
        if (metadata.pageCount === 0) {
            throw new Error("Security Rejection: Page count extraction failed.");
        }

        const reportId = `RPT-${uuidv4()}`;
        const timestamp = new Date().toISOString();

        // PHASE 2: VAULT STORAGE (Raw)
        await vaultService.storeFile(
            `${reportId}_RAW.txt`,
            Buffer.from(rawText),
            'text/plain'
        );

        // PHASE 3: DETERMINISTIC PARSING
        const parsedData = this.parseRawText(rawText);

        const report: CreditReport = {
            id: reportId,
            uploadDate: timestamp,
            fileName: metadata.fileName,
            rawPages: [rawText], // In a real scenario we might split this back up if needed
            personalInfo: parsedData.personalInfo,
            scores: parsedData.scores,
            tradelines: parsedData.tradelines,
            collections: parsedData.collections,
            inquiries: parsedData.inquiries,
            publicRecords: parsedData.publicRecords,
            summary: {
                totalDebt: parsedData.tradelines.reduce((sum, t) => sum + t.balance, 0),
                utilization: this.calculateUtilization(parsedData.tradelines),
                derogatoryCount: parsedData.tradelines.filter(t => ['COLLECTION', 'CHARGE_OFF', 'LATE', 'REPO'].includes(t.status)).length + parsedData.collections.length + parsedData.publicRecords.length,
                averageAgeYears: this.calculateAverageAge(parsedData.tradelines),
                oldestAccountYears: this.calculateOldestAccount(parsedData.tradelines)
            }
        };

        // PHASE 2: VAULT STORAGE (Parsed)
        await vaultService.storeFile(
            `${reportId}_PARSED.json`,
            Buffer.from(JSON.stringify(report)),
            'application/json'
        );

        console.log(`[Ingestion] Report ${reportId} secured and parsed.`);
        return reportId;
    },

    // --- Deterministic Regex Logic (Ported from Frontend) ---

    parseRawText(text: string) {
        const bureau = this.detectBureau(text);

        return {
            personalInfo: {
                name: this.extractName(text) || 'UNKNOWN CONSUMER',
                dob: this.extractDOB(text) || '1990-01-01',
                ssn: this.extractSSN(text) || '***-**-****',
                addresses: this.extractAddresses(text),
                employers: this.extractEmployers(text)
            },
            scores: {
                experian: this.extractScore(text, 'Experian') || 0,
                transunion: this.extractScore(text, 'TransUnion') || 0,
                equifax: this.extractScore(text, 'Equifax') || 0
            },
            tradelines: this.extractTradelines(text, bureau),
            collections: this.extractCollections(text),
            inquiries: this.extractInquiries(text),
            publicRecords: this.extractPublicRecords(text, bureau)
        };
    },

    detectBureau(text: string): 'Equifax' | 'TransUnion' | 'Experian' | 'Unknown' {
        if (/Equifax/i.test(text.substring(0, 5000))) return 'Equifax';
        if (/TransUnion|TU\s/i.test(text.substring(0, 5000))) return 'TransUnion';
        if (/Experian/i.test(text.substring(0, 5000))) return 'Experian';
        return 'Unknown';
    },

    extractName(text: string): string | null {
        const patterns = [
            /Name:\s*([A-Za-z\s\.]+)/i,
            /Consumer Name:\s*([A-Za-z\s\.]+)/i,
            /Subject:\s*([A-Za-z\s\.]+)/i,
            /Consumer Information\s+([A-Z\s]+?)\s+\d{2}\/\d{2}\/\d{4}/i
        ];
        for (const p of patterns) {
            const match = text.match(p);
            if (match && match[1].trim().length > 3) return match[1].trim();
        }
        return null;
    },

    extractDOB(text: string): string | null {
        const match = text.match(/(?:DOB|Date of Birth|Birth Date):\s*(\d{2}\/\d{2}\/\d{4})/i);
        return match ? match[1] : null;
    },

    extractSSN(text: string): string | null {
        const match = text.match(/(?:SSN|Social Security):\s*(\d{3}-?\d{2}-?\d{4}|\*{3}-\*{2}-\d{4})/i);
        return match ? match[1] : null;
    },

    extractAddresses(text: string): { street: string; dateReported: string }[] {
        const addresses: { street: string; dateReported: string }[] = [];
        const addressRegex = /(\d+\s+[A-Za-z0-9\s,]+(?:Ave|St|Rd|Blvd|Ln|Dr|Way|Ct|Plz)[A-Za-z0-9\s,]*?)\s+(?:Reported|Date):\s*(\d{2}\/\d{2,4})/gi;

        let match;
        while ((match = addressRegex.exec(text)) !== null) {
            if (match[1].length < 100) {
                addresses.push({ street: match[1].trim(), dateReported: match[2] });
            }
        }
        return addresses.length > 0 ? addresses : [{ street: 'Address detection failed', dateReported: new Date().toISOString() }];
    },

    extractEmployers(text: string): string[] {
        const match = text.match(/(?:Employment|Employer):\s*([A-Za-z0-9\s,]+)/i);
        return match ? [match[1].trim()] : [];
    },

    extractScore(text: string, bureau: string): number | null {
        const regex = new RegExp(`${bureau}.*?(?:Score|Rating).*?(\\d{3})`, 'i');
        const match = text.match(regex);
        return match ? parseInt(match[1]) : null;
    },

    extractTradelines(text: string, bureau: string): Tradeline[] {
        const tradelines: Tradeline[] = [];
        const strategies = {
            'Equifax': {
                start: /(?:Account Name|Creditor):\s*([A-Za-z0-9\s&,\.\-]+?)/gis,
                accountNum: /Account(?: #| Number):\s*([*0-9A-Za-z]+)/i,
                balance: /Balance:\s*[$]?([\d,]+)/i,
                status: /Status:\s*([A-Za-z\s]+)/i,
                history: /Payment History:\s*([A-Z0-9\s/]+?)(?=\n[A-Z]|$)/i
            },
            'TransUnion': {
                start: /([A-Za-z0-9\s&,\.\-]+?)\s+(?:Account|#)\s+([*0-9A-Za-z]+)/gi,
                accountNum: null,
                balance: /Balance:\s*[$]?([\d,]+)/i,
                status: /Status:\s*([A-Za-z\s]+)/i,
                history: /30\s+60\s+90\s+([*X\d\s]+)/i
            },
            'Experian': {
                start: /([A-Za-z0-9\s&,\.\-]+?)\s+\d{2}\/\d{2}\/\d{4}/gi,
                accountNum: /Account\s*#\s*([*0-9A-Za-z]+)/i,
                balance: /Recent\s*Balance\s*[$]?([\d,]+)/i,
                status: /Account\s*Status\s*([A-Za-z\s]+)/i,
                history: /Payment\s*History\s*([A-Z0-9\s]+)/i
            },
            'Unknown': {
                start: /(?:Creditor|Account Name|Lender):\s*([A-Za-z0-9\s&,\.\-]+?)/gis,
                accountNum: /Account(?: #| Number):\s*([*0-9A-Za-z]+)/i,
                balance: /Balance:\s*[$]?([\d,]+)/i,
                status: /Status:\s*([A-Za-z\s]+)/i,
                history: /([A-Z\s]{12,})/i
            }
        };

        const strategy = strategies[bureau as keyof typeof strategies] || strategies['Unknown'];
        const blocks = text.split(/(?=Account Name|Creditor|Lender|Account #)/i);

        let idCounter = 1;
        for (const block of blocks) {
            if (block.length < 50) continue;

            const creditorMatch = block.match(strategy.start);
            const accountMatch = block.match(strategy.accountNum || /Account #:\s*(\w+)/i);
            const balanceMatch = block.match(strategy.balance);
            const statusMatch = block.match(strategy.status);
            const historyMatch = block.match(strategy.history);

            if (creditorMatch) {
                const creditor = (bureau === 'Equifax' || bureau === 'Unknown') ? creditorMatch[1]?.trim() : block.split('\n')[0].trim();
                const accountNumber = accountMatch ? accountMatch[1].trim() : 'Unknown';
                const balance = balanceMatch ? parseInt(balanceMatch[1].replace(/,/g, '')) : 0;
                const rawStatus = statusMatch ? statusMatch[1].trim().toUpperCase() : 'OK';

                let status: Tradeline['status'] = 'OK';
                if (rawStatus.includes('LATE')) status = 'LATE';
                if (rawStatus.includes('COLLECTION')) status = 'COLLECTION';
                if (rawStatus.includes('CHARGE')) status = 'CHARGE_OFF';
                if (rawStatus.includes('CLOSED')) status = 'CLOSED';
                if (rawStatus.includes('REPO')) status = 'REPO';

                tradelines.push({
                    id: `TL-${idCounter++}`,
                    creditor: creditor || 'Unknown Creditor',
                    accountNumber,
                    status,
                    balance,
                    limit: 0,
                    openedDate: this.extractDate(block) || '2020-01-01',
                    paymentHistory: this.parsePaymentMatrix(historyMatch ? historyMatch[1] : ''),
                    agencies: {
                        experian: bureau === 'Experian',
                        transunion: bureau === 'TransUnion',
                        equifax: bureau === 'Equifax'
                    }
                });
            }
            if (tradelines.length > 50) break;
        }

        return tradelines;
    },

    extractDate(text: string): string | null {
        const match = text.match(/Opened:\s*(\d{2}\/\d{2}\/\d{4})/i);
        return match ? match[1] : null;
    },

    parsePaymentMatrix(historyText: string): string[] {
        const statuses: string[] = [];
        const statusRegex = /(OK|30|60|90|120|150|180|CO|RD|X|\*|ND|NR)/gi;
        let match;
        while ((match = statusRegex.exec(historyText)) !== null) {
            statuses.push(match[1].toUpperCase());
        }
        return statuses.slice(0, 24);
    },

    extractCollections(text: string): any[] {
        const collections: any[] = [];
        const collectionRegex = /(?:Collection Agency|Collector):\s*([A-Za-z0-9\s&,\.\-]+?)(?:.*?)Original Creditor:\s*([A-Za-z0-9\s&,\.\-]+?)(?:.*?)Amount:\s*[$]?([\d,]+)/gis;
        let match;
        let idCounter = 1;
        while ((match = collectionRegex.exec(text)) !== null) {
            collections.push({
                id: `COL-${idCounter++}`,
                creditor: match[1].trim(),
                originalCreditor: match[2].trim(),
                amount: parseInt(match[3].replace(/,/g, '')),
                dateOpened: '2020-01-01',
                status: 'UNPAID'
            });
        }
        return collections;
    },

    extractInquiries(text: string): any[] {
        const inquiries: any[] = [];
        const inqRegex = /(?:Inquiry|Inquired By):\s*([A-Za-z0-9\s&,\.\-]+?)(?:\s{2,}|\n)(?:Date):\s*(\d{2}\/\d{2}\/\d{2,4})/gi;
        let match;
        let idCounter = 1;
        while ((match = inqRegex.exec(text)) !== null) {
            inquiries.push({
                id: `INQ-${idCounter++}`,
                creditor: match[1].trim(),
                date: match[2],
                bureau: 'TransUnion'
            });
        }
        return inquiries;
    },

    extractPublicRecords(text: string, bureau: string): any[] {
        const records: any[] = [];
        const types = ['BANKRUPTCY', 'JUDGMENT', 'LIEN'];
        for (const type of types) {
            const regex = new RegExp(`(?:${type}|${type.toLowerCase()}).*?Date Filed:\\s*(\\d{2}/\\d{2}/\\d{2,4}).*?Status:\\s*([A-Za-z\\s]+)`, 'is');
            const match = text.match(regex);
            if (match) {
                records.push({
                    id: `PR-${records.length + 1}`,
                    type,
                    dateFiled: match[1],
                    referenceNumber: this.extractRefNum(text, type) || 'Unknown',
                    court: 'Unknown',
                    status: match[2].trim(),
                    amount: 0
                });
            }
        }
        return records;
    },

    extractRefNum(text: string, type: string): string | null {
        const regex = new RegExp(`${type}.*?Reference:\\s*([A-Z0-9-]+)`, 'i');
        const match = text.match(regex);
        return match ? match[1] : null;
    },

    calculateUtilization(tradelines: Tradeline[]): number {
        const totalLimit = tradelines.reduce((sum, t) => sum + t.limit, 0);
        const totalBal = tradelines.reduce((sum, t) => sum + t.balance, 0);
        return totalLimit > 0 ? Math.round((totalBal / totalLimit) * 100) : 0;
    },

    calculateAverageAge(tradelines: Tradeline[]): number {
        if (tradelines.length === 0) return 0;
        return 5.2; // keeping heuristic for now
    },

    calculateOldestAccount(tradelines: Tradeline[]): number {
        if (tradelines.length === 0) return 0;
        return 8.5; // keeping heuristic for now
    }
};
