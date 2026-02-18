import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

// Simple interface for storage adapters
interface StorageAdapter {
    upload(filename: string, buffer: Buffer, mimeType: string): Promise<string>;
    download(filename: string): Promise<Buffer>;
    list(): Promise<string[]>;
}

// 1. Supabase Adapter (Production)
class SupabaseAdapter implements StorageAdapter {
    private client;
    constructor(url: string, key: string) {
        this.client = createClient(url, key);
    }

    async upload(filename: string, buffer: Buffer, mimeType: string): Promise<string> {
        const { data, error } = await this.client
            .storage
            .from('merrymac-vault')
            .upload(filename, buffer, { contentType: mimeType, upsert: true });

        if (error) throw error;
        return data.path;
    }

    async download(filename: string): Promise<Buffer> {
        const { data, error } = await this.client
            .storage
            .from('merrymac-vault')
            .download(filename);

        if (error) throw error;
        return Buffer.from(await data.arrayBuffer());
    }

    async list(): Promise<string[]> {
        // Implementation omitted for brevity
        return [];
    }
}

// 2. Local Adapter (Fallback/Dev)
class LocalAdapter implements StorageAdapter {
    private basePath: string;
    constructor() {
        this.basePath = path.join(process.cwd(), 'local_vault');
        if (!fs.existsSync(this.basePath)) fs.mkdirSync(this.basePath, { recursive: true });
    }

    async upload(filename: string, buffer: Buffer, mimeType: string): Promise<string> {
        const filePath = path.join(this.basePath, filename);
        fs.writeFileSync(filePath, buffer);
        return filePath;
    }

    async download(filename: string): Promise<Buffer> {
        const filePath = path.join(this.basePath, filename);
        if (!fs.existsSync(filePath)) throw new Error("File not found");
        return fs.readFileSync(filePath);
    }

    async list(): Promise<string[]> {
        return fs.readdirSync(this.basePath);
    }
}

export class VaultService {
    private adapter: StorageAdapter;
    private encryptionKey: Buffer;

    constructor() {
        // Select adapter based on Env
        if (env.SUPABASE_URL && env.SUPABASE_KEY) {
            console.log("[Vault] Using Supabase Storage");
            this.adapter = new SupabaseAdapter(env.SUPABASE_URL, env.SUPABASE_KEY);
        } else {
            console.log("[Vault] Using Local Storage (WARNING: Not for Vercel Production)");
            this.adapter = new LocalAdapter();
        }

        // Derive key from secret or default (In prod, use a proper KMS or complex secret)
        const secret = process.env.VAULT_SECRET || 'default-insecure-secret-change-me-now-123';
        this.encryptionKey = crypto.scryptSync(secret, 'salt', 32);
    }

    private encrypt(buffer: Buffer): Buffer {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([iv, tag, encrypted]);
    }

    private decrypt(buffer: Buffer): Buffer {
        const iv = buffer.subarray(0, 16);
        const tag = buffer.subarray(16, 32);
        const encrypted = buffer.subarray(32);
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }

    async storeFile(filename: string, fileBuffer: Buffer, mimeType: string) {
        console.log(`[Vault] Encrypting ${filename}...`);
        const encrypted = this.encrypt(fileBuffer);
        const storedPath = await this.adapter.upload(`${filename}.enc`, encrypted, 'application/octet-stream');
        console.log(`[Vault] Stored at ${storedPath}`);
        return { filename, storedPath, status: 'ENCRYPTED' };
    }

    async retrieveFile(filename: string) {
        console.log(`[Vault] Retrieving ${filename}...`);
        const encrypted = await this.adapter.download(`${filename}.enc`);
        return this.decrypt(encrypted);
    }
}

export const vaultService = new VaultService();
