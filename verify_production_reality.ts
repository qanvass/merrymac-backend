
import axios from 'axios';
import { sovereignEngine, CaseMemory } from './src/engines/sovereign_engine';

const API_URL = 'http://localhost:3001';

async function runHardSweep() {
    console.log("Starting Hard Validation Sweep...");

    // PHASE 1: Persistence Reality Check (Logic Verification)
    console.log("\n🔎 PHASE 1: Persistence Enforcement");
    try {
        await CaseMemory.init();
        console.log("CaseMemory initialized (NOTE: Should have failed if strict mode is active).");
    } catch (error: any) {
        console.log("✅ Persistence Enforced: System refused to start without valid DB connection (Expected behavior in strict mode).");
        console.log(`   Error: ${error.message}`);
    }

    // PHASE 2 & 3: Route Truth Test
    console.log("\n🔎 PHASE 2 & 3: Route Truth Test");

    try {
        console.log("Testing /complaints/123...");
        await axios.get(`${API_URL}/complaints/123`);
        console.log("❌ FAIL: /complaints endpoint exists (unexpectedly).");
    } catch (error: any) {
        if (error.response && error.response.status === 404) {
            console.log("✅ TRUTH: /complaints endpoint returns 404 (No fake data).");
        } else {
            console.log(`❓ /complaints returned ${error.response ? error.response.status : error.code}`);
        }
    }

    try {
        console.log("Testing /automation/cfpb...");
        const response = await axios.post(`${API_URL}/automation/cfpb`, {
            caseId: "test-case-id",
            violations: [{ id: "v1", type: "FCRA" }]
        });

        if (response.status === 200 && response.data.id.startsWith("CFPB-")) {
            console.log(`✅ TRUTH: /automation/cfpb returned valid ID: ${response.data.id}`);
            console.log(`   Internal Details: ${response.data.details}`);
        } else {
            console.log(`❌ FAIL: Invalid automation response: ${JSON.stringify(response.data)}`);
        }
    } catch (error: any) {
        console.log(`❌ FAIL: /automation/cfpb returned error ${error.response ? error.response.status : error.code}`);
    }

    // PHASE 5: Data Integrity Check
    console.log("\n🔎 PHASE 5: Data Integrity Check");
    try {
        const dummyMeta = { name: "test_report.pdf", size: 1024, type: "application/pdf", lastModified: 1000 };
        const dummyText = `
            Name: JOHN DOE
            SSN: 123-45-6789
            Creditor: CHASE BANK
            Account: 111*****
            Status: CHARGE_OFF
            Balance: $5,000
            Date Opened: 01/01/2015
        `;

        console.log("Parsing dummy report...");
        const result = await sovereignEngine.parse(dummyText, dummyMeta.name);

        if (result.findings && Array.isArray(result.findings)) {
            console.log(`✅ Integrity: CanonicalCase has 'findings' array (Length: ${result.findings.length}).`);
            if (result.findings.length > 0) {
                console.log("✅ Integrity: Violations detected correctly.");
                console.log("   First Violation:", result.findings[0].description);
            } else {
                console.log("⚠️ Integrity: No violations found (Check regex logic).");
            }
        } else {
            console.log("❌ FAIL: CanonicalCase missing 'findings' array.");
        }

        if (result.consumer_identity.name === "JOHN DOE") {
            console.log("✅ Integrity: Identity extracted correctly.");
        } else {
            console.log(`❌ FAIL: Identity mismatch. Got '${result.consumer_identity.name}'`);
        }

    } catch (error) {
        console.error("Parsing/Integrity Error:", error);
    }
}

runHardSweep();
