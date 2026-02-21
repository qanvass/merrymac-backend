const fs = require('fs');
const PDFDocument = require('pdfkit');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

// Create a dummy PDF in memory
const doc = new PDFDocument();
let buffers = [];
doc.on('data', buffers.push.bind(buffers));
doc.on('end', async () => {
    let pdfData = Buffer.concat(buffers);

    console.log("Dummy PDF constructed. Simulating Secure Upload...");

    // Create form data just like the frontend
    const form = new FormData();
    form.append('file', pdfData, 'Test_Credit_Report.pdf');

    try {
        // NOTE: We bypass REQUIRE_AUTH for the test or use a mock token if needed.
        // Wait, the endpoint uses requireAuth, let's just log in via admin override or generate a token
        const tokenResp = await axios.post('http://localhost:8080/api/auth/admin/override', { secret: 'development_sso_secret_key_mock_123' }, { validateStatus: false });
        let token = 'development_sso_secret_key_mock_123';
        if (tokenResp.data && tokenResp.data.token) {
            token = tokenResp.data.token;
        }

        const response = await axios.post('http://localhost:8080/api/ingestion/upload', form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${token}`
            },
            validateStatus: false
        });

        console.log("Upload Response:", response.status, response.data);
    } catch (err) {
        console.error("Test failed:", err.message);
    }
});

// Write to the document
doc.fontSize(25).text('Equifax Credit Report', 100, 100);
doc.fontSize(12).text('\nConsumer: John Doe');
doc.fontSize(12).text('\nTradeline: CAPITAL ONE ENDING 4321 - LATE 30 DAYS');
doc.end();
