const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

    // Fallback exactly to how env configs are populated if .env is missing in root
    // we require dotenv to load any local definitions
    require('dotenv').config({ path: path.join(__dirname, '.env') });
    require('dotenv').config({ path: path.join(__dirname, '../.env') });

    let finalUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

    if (!finalUrl) {
        console.log("DATABASE_URL not found locally. Attempting to fetch from Railway CLI...");
        try {
            const { execSync } = require('child_process');
            const out = execSync('railway variables', { encoding: 'utf-8' });
            const match = out.match(/SUPABASE_DB_URL\s+(.+)/) || out.match(/DATABASE_URL\s+(.+)/);
            if (match && match[1]) {
                finalUrl = match[1].trim();
            }
        } catch (e) {
            console.error("Failed to fetch from Railway CLI:", e.message);
        }
    }

    if (!finalUrl) {
        console.error("ERROR: No DATABASE_URL found in environment to run migration.");
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: finalUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log("Connecting to Supabase Database...");
        const sqlPath = path.join(__dirname, 'supabase', 'migrations', '02_user_vaults.sql');
        console.log("Reading SQL Payload from: " + sqlPath);
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log("Executing Migration...");
        await pool.query(sql);
        console.log("Phase 10 Migration applied successfully.");
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await pool.end();
    }
}

runMigration();
