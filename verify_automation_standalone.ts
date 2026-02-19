
import { automationService } from './src/services/automation_service';

async function verify() {
    console.log("🚀 Starting Standalone Automation Verification...");
    try {
        const result = await automationService.submitComplaint("TEST-CASE-001", [{ id: "v1" }]);
        console.log("\n✅ AUTOMATION RESULT:");
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("\n❌ AUTOMATION FAILED:", error);
    }
}

verify();
