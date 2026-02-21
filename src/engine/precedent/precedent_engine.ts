/**
 * CourtListener Precedent Engine (Retrieval-Augmented Generation)
 * 
 * This engine connects to the Free Law Project's CourtListener API to dynamically 
 * fetch relevant case law snippets based on the creditor dropping the derogatory 
 * mark, and the specific statutes involved (e.g. FDCPA, FCRA).
 */

import fetch from 'node-fetch';
import { env } from '../../config/env';

export interface PrecedentSnippet {
    id: number;
    caseName: string;
    dateFiled: string;
    snippet: string;
    url: string;
}

export const precedentEngine = {
    /**
     * Searches CourtListener for opinions involving this creditor and the specified statutes.
     * @param creditorName The name of the bank/collection agency (e.g., "Midland Funding")
     * @param statutes Array of statutes involved (e.g., ["FDCPA", "FCRA"])
     * @returns Array of the top most relevant precedent snippets.
     */
    async searchRelevantCaseLaw(creditorName: string, statutes: string[] = ["FDCPA"]): Promise<PrecedentSnippet[]> {
        console.log(`[PrecedentEngine] Searching CourtListener for cases involving: '${creditorName}' under ${statutes.join(', ')}`);

        try {
            // Build the query. We want opinions where the creditor is mentioned AND the statute is debated.
            // CourtListener uses a standard search q parameter.
            const statuteQuery = statutes.join(' OR ');
            const query = `"${creditorName}" AND (${statuteQuery})`;

            // CourtListener API Endpoint for Opinions
            const url = `https://www.courtlistener.com/api/rest/v3/search/?q=${encodeURIComponent(query)}&type=o&order_by=score desc`;

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            // Inject API Key if available (Free Tier provides 5,000 requests/day, otherwise 500)
            if (env.COURTLISTENER_API_KEY) {
                headers['Authorization'] = `Token ${env.COURTLISTENER_API_KEY}`;
            } else {
                console.warn("[PrecedentEngine] No COURTLISTENER_API_KEY found. Operating under strict guest rate limits.");
            }

            const response = await fetch(url, { headers });

            if (!response.ok) {
                console.error(`[PrecedentEngine] CourtListener API failed: ${response.statusText}`);
                return [];
            }

            const data = await response.json();

            if (!data.results || data.results.length === 0) {
                console.log(`[PrecedentEngine] No direct precedent found for ${creditorName}. Falling back to general statutes.`);
                return this.searchGeneralStatutePrecedent(statutes);
            }

            // Map the top 3 results into our snippet format
            return data.results.slice(0, 3).map((result: any) => {
                // The search API returns highlighted 'snippet' arrays showing context
                const bestSnippet = result.snippet && result.snippet.length > 0
                    ? result.snippet[0].replace(/<\/?[^>]+(>|$)/g, "") // Strip HTML tags like <em>
                    : `Opinion discusses ${creditorName} in the context of consumer litigation.`;

                return {
                    id: result.id,
                    caseName: result.caseName || "Unknown Consumer v. Creditor",
                    dateFiled: result.dateFiled,
                    snippet: bestSnippet,
                    url: `https://www.courtlistener.com${result.absolute_url}`
                };
            });

        } catch (error) {
            console.error(`[PrecedentEngine] RAG Error:`, error);
            // Non-fatal. If RAG fails, the LLM just operates zero-shot.
            return [];
        }
    },

    /**
     * Fallback: If no cases exist for "Small Town Credit Union", just pull generic FDCPA/FCRA wins.
     */
    async searchGeneralStatutePrecedent(statutes: string[]): Promise<PrecedentSnippet[]> {
        try {
            const query = `${statutes.join(' ')} "actual damages" "statutory damages"`;
            const url = `https://www.courtlistener.com/api/rest/v3/search/?q=${encodeURIComponent(query)}&type=o&order_by=score desc`;

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            if (env.COURTLISTENER_API_KEY) {
                headers['Authorization'] = `Token ${env.COURTLISTENER_API_KEY}`;
            }

            const response = await fetch(url, { headers });

            if (!response.ok) return [];

            const data = await response.json();

            if (!data.results) return [];

            return data.results.slice(0, 2).map((result: any) => {
                const bestSnippet = result.snippet && result.snippet.length > 0
                    ? result.snippet[0].replace(/<\/?[^>]+(>|$)/g, "")
                    : `Opinion establishing baseline precedents for ${statutes.join(', ')}.`;

                return {
                    id: result.id,
                    caseName: result.caseName,
                    dateFiled: result.dateFiled,
                    snippet: bestSnippet,
                    url: `https://www.courtlistener.com${result.absolute_url}`
                };
            });
        } catch (err) {
            return [];
        }
    }
};
