import { sovereignEngine } from './engines/sovereign_engine';
import { sovereignEmitter } from './events/sovereign_events';

async function simulateHighVolumeIngestion() {
    console.log("--- Sovereign Phase 15 Simulation Start ---");

    // Simulate a 100-page report (approx 20,000 lines)
    const mockReport = Array(20000).fill("Account Name: Mock Bank\nAccount Number: 12345\nBalance: $500\nStatus: OK\nOpened: 01/01/2020\n").join("\n");

    sovereignEmitter.subscribe("SIM-123", (event) => {
        console.log(`[EVENT] Phase: ${event.phase} | Progress: ${event.progress_percentage}% | ${event.message}`);
    });

    try {
        const result = await sovereignEngine.parse(mockReport, "simulation_99_pages.txt", "SIM-123");
        console.log("--- Simulation Complete ---");
        console.log(`Total Accounts Extracted: ${result.tradelines.length}`);
        console.log(`Findings: ${result.findings.length}`);
        console.log(`First Finding: ${result.findings[0]?.description}`);
    } catch (error) {
        console.error("Simulation Failed:", error);
    }
}

// Note: This requires environment variables (OPENAI_API_KEY) to run the AI parts
// simulateHighVolumeIngestion();
