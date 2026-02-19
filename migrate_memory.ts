
import fs from 'fs/promises';
import path from 'path';
import { supabase } from './src/services/supabase';
import { CanonicalCase } from './src/types/sovereign_types';

const MEMORY_PATH = path.join(process.cwd(), 'sovereign_memory');

async function migrate() {
    console.log("--- STARTING MIGRATION ---");

    if (!supabase) {
        console.error("CRITICAL: Supabase client not initialized. Cannot migrate.");
        process.exit(1);
    }

    try {
        const files = await fs.readdir(MEMORY_PATH);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        console.log(`Found ${jsonFiles.length} files to migrate.`);

        for (const file of jsonFiles) {
            const filePath = path.join(MEMORY_PATH, file);
            const content = await fs.readFile(filePath, 'utf-8');

            try {
                const caseData: CanonicalCase = JSON.parse(content);

                console.log(`Migrating Case ID: ${caseData.case_id}...`);

                const { error } = await supabase
                    .from('cases')
                    .upsert({
                        id: caseData.case_id,
                        data: caseData,
                        updated_at: new Date().toISOString()
                    });

                if (error) {
                    console.error(`FAILED to migrate ${file}:`, error);
                } else {
                    console.log(`SUCCESS: Migrated ${file}. Deleting local file...`);
                    // await fs.unlink(filePath); // Uncomment to delete after verification
                    // Renaming to .migrated for safety during this run
                    await fs.rename(filePath, filePath + '.migrated');
                }

            } catch (err) {
                console.error(`Error parsing ${file}:`, err);
            }
        }

    } catch (err) {
        console.error("Migration Error:", err);
    }
}

migrate().catch(console.error);
