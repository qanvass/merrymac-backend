
import { IntelligenceTradeline } from '../types/intelligence_types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Normalizes creditor names by removing common suffixes and using a lookup map.
 */
export function normalizeCreditorName(name: string): string {
    const cleanName = name.toUpperCase()
        .replace(/ (BANK|NA|NATIONAL ASSOCIATION|FSB|INC|LLC|CORPORATION|CORP)$/, '')
        .trim();

    const lookupMap: Record<string, string> = {
        'JPM CHASE': 'CHASE',
        'JPMORGAN CHASE': 'CHASE',
        'CHASE BANK': 'CHASE',
        'AMEX': 'AMERICAN EXPRESS',
        'CAP1': 'CAPITAL ONE',
        'CAPITALONE': 'CAPITAL ONE',
        'SYNCB': 'SYNCHRONY BANK',
        'CBNA': 'CITIBANK',
        'CITI': 'CITIBANK'
    };

    return lookupMap[cleanName] || cleanName;
}

/**
 * Heuristic to determine if two tradelines are likely the same account.
 */
export function isDuplicate(t1: IntelligenceTradeline, t2: IntelligenceTradeline): boolean {
    // 1. Same account number (partial match)
    const acc1 = t1.accountNumber.originalValue.replace(/\*/g, '');
    const acc2 = t2.accountNumber.originalValue.replace(/\*/g, '');

    if (acc1 && acc2 && (acc1.includes(acc2) || acc2.includes(acc1)) && acc1.length >= 4) {
        return true;
    }

    // 2. Same creditor + Same open date + Similar balance
    const creditor1 = normalizeCreditorName(t1.creditor.value);
    const creditor2 = normalizeCreditorName(t2.creditor.value);

    if (creditor1 === creditor2 && t1.dateOpened.value === t2.dateOpened.value) {
        const balanceDiff = Math.abs(t1.balance.value - t2.balance.value);
        if (balanceDiff < 50) return true; // Account for slight reporting delays
    }

    return false;
}

/**
 * Merges a list of tradelines from multiple sources into a de-duplicated canonical set.
 */
export function resolveTradelineDuplicates(tradelines: IntelligenceTradeline[]): IntelligenceTradeline[] {
    const resolved: IntelligenceTradeline[] = [];

    for (const tl of tradelines) {
        const existing = resolved.find(r => isDuplicate(r, tl));
        if (existing) {
            // Merge logic: Pick the higher confidence field
            if (tl.balance.confidence > existing.balance.confidence) {
                existing.balance = tl.balance;
            }
            // Aggregate sources
            if (!existing.creditor.source.includes(tl.creditor.source)) {
                existing.creditor.source += `, ${tl.creditor.source}`;
            }
        } else {
            resolved.push({ ...tl });
        }
    }

    return resolved;
}
