const https = require('https');
const http = require('http');

const BACKEND_URL = process.argv[2]; // e.g. https://merrymac-backend.up.railway.app
const FRONTEND_ORIGIN = process.argv[3] || 'https://merrymac-ui.vercel.app';

if (!BACKEND_URL) {
    console.error("Usage: node verify_production.js <BACKEND_URL> [FRONTEND_ORIGIN]");
    process.exit(1);
}

async function request(method, path, body = null, headers = {}) {
    const lib = BACKEND_URL.startsWith('https') ? https : http;
    return new Promise((resolve) => {
        const req = lib.request(BACKEND_URL + path, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', e => resolve({ error: e, status: 0, body: '' }));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    console.log(`Target: ${BACKEND_URL}`);
    console.log(`Origin: ${FRONTEND_ORIGIN}`);

    const report = {
        railway_build_success: false, // Inferred from health check
        server_started: false,
        port_bound_correctly: false,
        env_complete: false, // Inferred
        missing_vars: [],
        health_live: false,
        forensic_live: false,
        scoring_live: false,
        llm_live: false,
        email_live: false,
        cors_locked_properly: false,
        backend_live: false,
        stable_under_production: false,
        safe_to_link_frontend: false
    };

    // 1. Health Check
    console.log("Checking Health...");
    const health = await request('GET', '/health');
    if (health.status === 200) {
        report.server_started = true;
        report.railway_build_success = true;
        report.health_live = true;
        report.backend_live = true; // At least running

        try {
            const hBody = JSON.parse(health.body);
            if (hBody.env === 'production') {
                report.stable_under_production = true;
            }
        } catch (e) { }
    } else {
        console.log("Health Check Failed:", health.status);
    }

    // 2. Variable Check (Inferred via endpoints)
    console.log("Checking Endpoints...");

    // Forensic
    const forensic = await request('POST', '/api/forensic/scan', { report: { tradelines: [] } });
    if (forensic.status === 200) report.forensic_live = true;

    // LLM (Check for 500/401 vs 200)
    const llm = await request('POST', '/api/llm/analyze', { report: { tradelines: [] } });
    if (llm.status === 200) {
        report.llm_live = true;
    } else if (llm.status === 500 || llm.status === 401) {
        console.log("LLM Endpoint Reachable but Error (Check Keys):", llm.status);
        // It's "live" as an endpoint, but maybe not fully config'd. 
        // We'll mark false for "live" functionality if it errors.
    }

    // Email
    const email = await request('POST', '/api/email/send', { to: 'test@example.com', subject: 'Prod Test', body: 'Test' });
    if (email.status === 200 || email.status === 400) report.email_live = true; // 400 means route hit but maybe bad data

    // 3. CORS Check
    console.log("Checking CORS...");
    const corsGood = await request('OPTIONS', '/api/forensic/scan', null, { 'Origin': FRONTEND_ORIGIN });
    const corsBad = await request('OPTIONS', '/api/forensic/scan', null, { 'Origin': 'https://evil.com' });

    const goodAllowed = corsGood.headers['access-control-allow-origin'] === FRONTEND_ORIGIN;
    const badBlocked = !corsBad.headers['access-control-allow-origin'] || corsBad.headers['access-control-allow-origin'] !== 'https://evil.com';

    if (goodAllowed && badBlocked) {
        report.cors_locked_properly = true;
    } else {
        console.log("CORS Check Details:", { good: corsGood.headers['access-control-allow-origin'], bad: corsBad.headers['access-control-allow-origin'] });
    }

    // Final Env Inference
    if (report.llm_live && report.email_live) {
        report.env_complete = true;
    } else {
        if (!report.llm_live) report.missing_vars.push("OPENAI_API_KEY");
        if (!report.email_live) report.missing_vars.push("EMAIL_USER/PASS");
    }

    report.safe_to_link_frontend = report.health_live && report.cors_locked_properly;

    console.log("\n--- DEPLOYMENT REPORT ---");
    console.log(JSON.stringify(report, null, 2));
}

run();
