
import { sovereignEngine, CaseMemory } from './src/engines/sovereign_engine';
import { supabase } from './src/services/supabase';

const MOCK_REPORT = `
Name: JOHN DOE
DOB: 01/01/1980
SSN: 123-45-6789

Account Number: 123456789
Chase Bank
Status: Open
Balance: $520.00
Limit: $5,000.00
Date Opened: 05/15/2018

Account Number: 987654321
Bank of America
Status: Charge-off
Balance: $1,200.00
Limit: $2,000.00
Date Opened: 10/10/2015
`;

async function runDebug() {
    console.log("--- SOVEREIGN PROTOCOL DEBUG ---");

    // 1. Test Parsing
    console.log("[1] Testing Parsing Logic...");
    const canonical = await sovereignEngine.parse(MOCK_REPORT, "debug_report.pdf");

    console.log(" Identity:", canonical.consumer_identity);
    console.log(" Tradelines Found:", canonical.tradelines.length);

    if (canonical.tradelines.length !== 2) {
        console.error("FAIL: Expected 2 tradelines, found " + canonical.tradelines.length);
    } else {
        console.log("PASS: Tradeline extraction verified.");
        console.log("    TL 1:", canonical.tradelines[0].creditor, canonical.tradelines[0].balance);
        console.log("    TL 2:", canonical.tradelines[1].creditor, canonical.tradelines[1].balance);
    }

    // 2. Test Persistence Connection (Dry Run)
    console.log("\n[2] Testing Persistence Configuration...");
    if (!supabase) {
        console.log("WARN: Supabase client not initialized (Env vars missing?). Using FS Fallback.");
    } else {
        console.log("PASS: Supabase client initialized.");
    }
}

runDebug().catch(console.error);
