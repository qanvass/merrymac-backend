
import { sovereignEngine } from './src/engines/sovereign_engine';

async function verifyReality() {
    console.log("🚀 Starting Reality Enforcement Verification...");

    const dummyText = `
    Name: JANE DOE
    SSN: 999-88-7777
    DOB: 01/01/1980

    CHASE BANK
    Account Number: 11223344
    Status: Current
    Balance: $1,250
    Limit: $5,000
    Date Opened: 01/01/2020

    WELLS FARGO
    Account Number: 55667788
    Status: Charge-off
    Balance: $900
    Limit: $1,000
    Date Opened: 05/15/2018
    `;

    console.log("Parsing multi-tradeline dummy text...");
    try {
        const result = await sovereignEngine.parse(dummyText, "reality_check.pdf");

        console.log(`\n✅ Parsing Complete. Found ${result.tradelines.length} tradelines.`);

        result.tradelines.forEach((tl, idx) => {
            console.log(`   [${idx + 1}] ${tl.creditor} | Acc: ${tl.account_number} | Bal: $${tl.balance} | Status: ${tl.status_code}`);
        });

        if (result.tradelines.length === 2) {
            console.log("\n✅ SUCCESS: Block-Based Parser captured multiple tradelines dynamically.");
        } else {
            console.log(`\n❌ FAIL: Expected 2 tradelines, found ${result.tradelines.length}. Check block logic.`);
        }

    } catch (error) {
        console.error("\n❌ PARSING FAILED:", error);
    }
}

verifyReality();
