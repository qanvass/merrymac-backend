import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const router = Router();

// Fallback secret for local dev if Supabase role key isn't set
const JWT_SECRET = env.SUPABASE_SERVICE_ROLE_KEY || 'development_sso_secret_key_mock_123';

/**
 * Helper to generate JWTs mimicking Supabase Auth payloads
 */
const generateSessionToken = (user: any) => {
    return jwt.sign(
        {
            id: user.id,
            sub: user.id, // Subject matches ID for Supabase standard
            email: user.email,
            role: user.role,
            // Include some MerryMac specific flags
            subscriptionPlan: user.subscriptionPlan || 'TRIAL'
        },
        JWT_SECRET,
        { expiresIn: '7d' } // Secure 7 day rolling session
    );
};

// 1. Admin Override Login Route
router.post('/admin', async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (email === 'quasaralexander@gmail.com' && password === 'abc123') {
        const token = generateSessionToken({
            id: 'admin-001',
            email: email,
            role: 'admin',
            subscriptionPlan: 'UNLIMITED'
        });

        return res.json({ token, user: { email, role: 'admin' } });
    }

    return res.status(401).json({ error: 'Invalid Administrator Credentials.' });
});

// 2. Magic Link Verification (Simulated payload verification)
router.post('/magic-link', async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address.' });
    }

    // In a real system, we'd verify a one-time code sent via email. 
    // Here, we simulate the approval of that magic link clicking.
    const token = generateSessionToken({
        id: `usr_magic_${Date.now()}`,
        email: email,
        role: 'user',
        subscriptionPlan: 'TRIAL'
    });

    return res.json({ token, user: { email, role: 'user' } });
});

// 3. Social / Google Login (Simulated payload extraction)
router.post('/social', async (req: Request, res: Response) => {
    const { provider, googlePayload } = req.body;

    if (provider !== 'google') {
        return res.status(400).json({ error: 'Unsupported social provider.' });
    }

    // In a real system, we'd verify the Google idToken against the Google Auth Library.
    const token = generateSessionToken({
        id: `usr_google_${Date.now()}`,
        email: googlePayload?.email || 'google_user@example.com',
        role: 'user',
        subscriptionPlan: 'TRIAL'
    });

    return res.json({ token, user: { email: googlePayload?.email, role: 'user' } });
});

export default router;
