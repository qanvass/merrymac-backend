const { spawn } = require('child_process');
const http = require('http');

function startServer(env) {
    return new Promise((resolve, reject) => {
        const server = spawn('node', ['dist/server.js'], {
            env: { ...process.env, ...env },
            detached: false
        });

        let output = '';
        let started = false;

        server.stdout.on('data', (data) => {
            const str = data.toString();
            output += str;
            if (str.includes('MerryMac Backend running') && !started) {
                started = true;
                resolve({ server, output });
            }
        });

        server.stderr.on('data', (data) => {
            const str = data.toString();
            output += str;
        });

        server.on('close', (code) => {
            if (!started) {
                resolve({ server: null, code, output });
            }
        });

        // Timeout (5s)
        setTimeout(() => {
            if (!started) {
                if (server.kill()) console.log("Timeout kill sent");
                resolve({ server: null, code: 'TIMEOUT', output });
            }
        }, 5000);
    });
}

async function request(port, method, path, headers = {}) {
    return new Promise((resolve) => {
        const req = http.request(`http://localhost:${port}` + path, {
            method,
            headers: { 'Content-Type': 'application/json', ...headers }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
        });
        req.on('error', e => resolve({ error: e }));
        req.end();
    });
}

async function run() {
    console.log("--- TEST 1: Production Mode Missing Keys ---");
    const test1 = await startServer({
        NODE_ENV: 'production',
        PORT: 3002 // Use different port
    });

    if (test1.code !== 0 && test1.output.includes('CRITICAL: OPENAI_API_KEY is missing')) {
        console.log("✅ PASS: Server failed to start without keys.");
    } else {
        console.log("❌ FAIL: Server started or failed with wrong error.", test1.output);
        if (test1.server) test1.server.kill();
    }

    console.log("\n--- TEST 2: Production Mode Valid Keys + CORS ---");
    const test2 = await startServer({
        NODE_ENV: 'production',
        PORT: 3003,
        OPENAI_API_KEY: 'sk-test-dummy',
        CORS_ORIGIN: 'https://merrymac.io',
        EMAIL_USER: 'test',
        EMAIL_PASS: 'test'
    });

    if (test2.server) {
        console.log("✅ PASS: Server started with valid keys.");

        // Test Endpoint
        console.log("Testing Endpoint...");
        const res = await request(3003, 'POST', '/api/forensic/scan', { 'Origin': 'https://merrymac.io' }); // Origin header usually ignored by server-to-server but good to trace

        if (res.status === 200 || res.status === 400 || res.status === 401) {
            console.log(`✅ PASS: Endpoint reachable (Status: ${res.status})`);
        } else {
            console.log(`❌ FAIL: Endpoint status ${res.status}`);
        }

        test2.server.kill();
    } else {
        console.log("❌ FAIL: Server failed to start.", test2.output);
    }
}

run();
