import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    PORT: z.string().default('3001'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    API_BASE_URL: z.string().default('http://localhost:3001'),
    OPENAI_API_KEY: z.string().optional(),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_KEY: z.string().optional(),
    EMAIL_USER: z.string().optional(),
    EMAIL_PASS: z.string().optional(),
    EMAIL_HOST: z.string().default('smtp.gmail.com'),
    ADMIN_EMAIL: z.string().optional(),
    CORS_ORIGIN: z.string().default('*'),
    COURTLISTENER_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
