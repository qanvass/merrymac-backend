
import { NormalizedField, ConfidenceScore } from '../types/intelligence_types';
import { parse, format, isValid, differenceInDays, parseISO } from 'date-fns';

/**
 * Normalizes various date strings to ISO 8601 (YYYY-MM-DD).
 */
export function normalizeDate(dateStr: string | null | undefined): string | null {
    if (!dateStr) return null;

    const formats = ['MM/dd/yyyy', 'MM-dd-yyyy', 'yyyy/MM/dd', 'yyyy-MM-dd', 'MMM d, yyyy', 'MMMM d, yyyy'];

    for (const f of formats) {
        try {
            const parsedDate = parse(dateStr, f, new Date());
            if (isValid(parsedDate)) {
                return format(parsedDate, 'yyyy-MM-dd');
            }
        } catch (e) {
            // Continue to next format
        }
    }

    // fallback: if it looks like a year-only or something else, return null rather than garbage
    return null;
}

/**
 * Maps human-readable statuses to Metro 2 Status Codes.
 * (Partial mapping for key derogatory states)
 */
export function mapStatusToMetro2(status: string): string {
    const s = status.toLowerCase();
    if (s.includes('current') || s === 'ok') return '11';
    if (s.includes('30 day')) return '71';
    if (s.includes('60 day')) return '78';
    if (s.includes('90 day')) return '80';
    if (s.includes('charge') || s.includes('loss')) return '97';
    if (s.includes('collection')) return '93';
    if (s.includes('repo')) return '96';
    if (s.includes('bankruptcy')) return 'D';

    return '01'; // Unknown/Other
}

/**
 * Helper to create a NormalizedField structure.
 */
export function createNormalizedField<T>(
    value: T,
    originalValue: string,
    confidence: ConfidenceScore,
    source: string
): NormalizedField<T> {
    return {
        value,
        originalValue,
        confidence,
        source
    };
}
/**
 * Calculates confidence decay based on the age of the data.
 * Heuristic: -5% confidence for every 30 days since reporting.
 */
export function calculateConfidenceDecay(initialConfidence: number, reportedDate: string): number {
    try {
        const now = new Date();
        const reported = parseISO(reportedDate);
        const daysSince = differenceInDays(now, reported);

        if (daysSince <= 0) return initialConfidence;

        const decimalDecay = Math.floor(daysSince / 30) * 0.05;
        const finalConfidence = Math.max(0, initialConfidence * (1 - decimalDecay));

        return Math.round(finalConfidence);
    } catch (e) {
        return initialConfidence;
    }
}

/**
 * Weighted Source Reliability Map
 */
export const SOURCE_WEIGHTS: Record<string, number> = {
    'MYFICO': 1.0,
    'PDF_AUTO_EXTRACT': 0.85,
    'CREDIT_KARMA': 0.75,
    'USER_INPUT': 0.5,
    'UNKNOWN': 0.6
};

/**
 * Resolve conflict between two data points based on weighted confidence.
 * RED-TEAM Mitigation: Mark as CONFLICT if high-confidence sources disagree.
 */
export function resolveFieldConflict<T>(current: NormalizedField<T>, incoming: NormalizedField<T>): NormalizedField<T> {
    const HIGH_CONFIDENCE = 80;

    // If both are high confidence but values differ, mark as CONFLICT
    if (current.confidence >= HIGH_CONFIDENCE && incoming.confidence >= HIGH_CONFIDENCE && current.value !== incoming.value) {
        return {
            ...incoming,
            value: 'CONFLICT' as any,
            originalValue: 'CONFLICT',
            confidence: Math.max(current.confidence, incoming.confidence)
        };
    }

    if (incoming.confidence > current.confidence) {
        return incoming;
    }
    return current;
}
