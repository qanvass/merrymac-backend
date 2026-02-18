const https = require('https');

const BACKEND_URL = 'https://merrymac-backend-production.up.railway.app';
const FRONTEND_ORIGIN = 'https://merrymac.io';

async function request(method, path, body = null, headers = {}) {
    return new Promise((resolve) => {
        const req = https.request(BACKEND_URL + path, {
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
        req.on('error', e => resolve({ error: e }));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    console.log(`Auditing: ${BACKEND_URL}`);

    const results = {
        backend_reachable: false,
        cors_blocked: false,
        status_code: 0,
        cors_locked: false,
        production_mode: false
    };

    // PHASE 2: Live Request Test
    console.log("--- Phase 2: Live POST Test ---");
    // We send a valid structure but empty data to hit the logic
    const scan = await request('POST', '/api/forensic/scan', { report: { tradelines: [] } });
    if (scan.error) {
        console.log("Connection Error:", scan.error.message);
    } else {
        console.log(`Status: ${scan.status}`);
        results.status_code = scan.status;
        if (scan.status === 200 || scan.status === 400 || scan.status === 401) {
            results.backend_reachable = true;
        }
        // Check if HTML (which implies 404/Error page from hosting provider usually)
        if (scan.body && scan.body.trim().startsWith('<')) {
            console.log("Received HTML instead of JSON. Possible deployment error or 404.");
            results.backend_reachable = false;
        }
    }

    // PHASE 3: CORS Enforcement
    console.log("\n--- Phase 3: CORS Audit ---");
    // 1. Authorized Origin
    const corsGood = await request('OPTIONS', '/api/forensic/scan', null, { 'Origin': FRONTEND_ORIGIN });
    const allowGood = corsGood.headers['access-control-allow-origin'];

    // 2. Unauthorized Origin
    const corsBad = await request('OPTIONS', '/api/forensic/scan', null, { 'Origin': 'https://evil.com' });
    const allowBad = corsBad.headers['access-control-allow-origin'];

    console.log(`Good Origin (${FRONTEND_ORIGIN}) Allowed: ${allowGood}`);
    console.log(`Bad Origin (https://evil.com) Allowed: ${allowBad}`);

    if (allowGood === FRONTEND_ORIGIN && allowBad !== 'https://evil.com' && allowBad !== '*') {
        results.cors_locked = true;
    } else if (allowGood === '*' || allowBad === '*') {
        console.log("CORS is Wildcard * (Not Locked)");
        results.cors_locked = false;
    } else {
        console.log("CORS Configuration Mismatch");
    }

    // Check Production Mode (via Health)
    const health = await request('GET', '/health');
    if (health.status === 200) {
        try {
            const h = JSON.parse(health.body);
            console.log("Env:", h.env);
            if (h.env === 'production') results.production_mode = true;
        } catch (e) { }
    }

    console.log("\n--- AUDIT RESULTS ---");
    console.log(JSON.stringify(results, null, 2));
}

run();
