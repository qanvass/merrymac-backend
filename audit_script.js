const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3001,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

const checks = [
    { path: '/api/forensic/scan', body: { report: { tradelines: [], collections: [], inquiries: [] } } },
    { path: '/api/scoring/simulate', body: { report: { scores: {}, tradelines: [], collections: [], inquiries: [] } } },
    { path: '/api/llm/analyze', body: { report: { tradelines: [] } } },
    { path: '/api/email/send', body: { to: 'test@example.com', subject: 'Test', body: 'Test Body' } }
];

async function runChecks() {
    console.log("Starting Endpoint Validation...");
    for (const check of checks) {
        await new Promise((resolve) => {
            const req = http.request({ ...options, path: check.path }, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    console.log(`[${res.statusCode}] ${check.path}`);
                    if (res.statusCode >= 500) console.log("Response:", data);
                    resolve();
                });
            });
            req.on('error', e => {
                console.error(`[ERROR] ${check.path}: ${e.message}`);
                resolve();
            });
            req.write(JSON.stringify(check.body));
            req.end();
        });
    }
}

runChecks();
