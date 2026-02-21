import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth_middleware';
import { supabase } from '../services/supabase';

const router = Router();

// Phase 10: Secure Backend Session Synchronization
// This endpoint is called by the frontend after a successful Supabase login to ensure the user profile exists in public.user_profiles
router.post('/sync', requireAuth, async (req: any, res: Response) => {
    try {
        const user = req.user;
        if (!user || !supabase) {
            return res.status(400).json({ error: 'Supabase client not active or user missing.' });
        }

        // Upsert user profile into public.user_profiles
        const { error } = await supabase.from('user_profiles').upsert({
            id: user.id,
            email: user.email,
            role: 'user', // Default role for new signups
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

        if (error) {
            console.error('[Auth Sync] Failed to sync user profile:', error);
            return res.status(500).json({ error: 'Failed to synchronize user profile state.' });
        }

        return res.json({ success: true, message: 'User profile synchronized securely.', user: { id: user.id, email: user.email } });
    } catch (err) {
        console.error('[Auth Sync] Unexpected error:', err);
        return res.status(500).json({ error: 'Internal Server Error during sync.' });
    }
});


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

// --- Phase 13: Standard Email & Password Auth with Verification ---

// Mocking a database for unverified and verified users since we don't have Supabase Auth's actual password hash table configured natively right now.
// In a full production scenario, we would use `supabase.auth.signUp()`. For this Phase 13 request, we handle the credentials directly to satisfy the exact hardcoded admin requirements and standard flow demo.
const demoUserDB = new Map<string, { passwordHash: string, verified: boolean, role: string }>();

// Seed the requested Admin users
demoUserDB.set('quasaralexander@gmail.com', { passwordHash: 'abc123', verified: true, role: 'admin' });
demoUserDB.set('qanvass@gmail.com', { passwordHash: 'abc123', verified: true, role: 'admin' });

// Setup Nodemailer for Verification Emails
import nodemailer from 'nodemailer';
let transporter: nodemailer.Transporter | null = null;
nodemailer.createTestAccount().then(account => {
    transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass }
    });
    console.log('[Auth] Nodemailer Ethereal test account ready.');
}).catch(console.error);


// 1. Signup Route
router.post('/signup', async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !email.includes('@') || !password) {
        return res.status(400).json({ error: 'Valid email and password are required.' });
    }

    if (demoUserDB.has(email)) {
        return res.status(400).json({ error: 'Email already registered.' });
    }

    // Hash password (simulated for now, would use bcrypt)
    demoUserDB.set(email, { passwordHash: password, verified: false, role: 'user' });

    // Generate Verification JWT
    const verifyToken = jwt.sign({ email, intent: 'verify' }, JWT_SECRET, { expiresIn: '1h' });
    const verifyUrl = `${env.API_BASE_URL || 'http://localhost:8080'}/api/auth/verify?token=${verifyToken}`;

    // Dispatch Email
    if (transporter) {
        try {
            const info = await transporter.sendMail({
                from: '"MerryMac Security" <noreply@merrymac.io>',
                to: email,
                subject: "Verify Your MerryMac Account",
                html: `<b>Welcome to MerryMac!</b><br/>Please click this secure link to verify your email and activate your account:<br/><a href="${verifyUrl}">${verifyUrl}</a>`
            });
            console.log(`[Auth] Verification Email Sent! Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        } catch (err) {
            console.error('[Auth] Failed to send verification email', err);
        }
    }

    return res.json({ success: true, message: 'Signup successful. Please check your email to verify your account.' });
});

// 2. Email Verification Route
router.get('/verify', async (req: Request, res: Response) => {
    const token = req.query.token as string;

    if (!token) return res.status(400).send('Verification token is missing.');

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded.intent !== 'verify' || !decoded.email) {
            throw new Error('Invalid token intent.');
        }

        const user = demoUserDB.get(decoded.email);
        if (!user) return res.status(404).send('User not found.');

        user.verified = true;

        // Sync public profile in background
        if (supabase) {
            supabase.from('user_profiles').upsert({
                id: `usr_${Date.now()}`,
                email: decoded.email,
                role: user.role,
                updated_at: new Date().toISOString()
            }, { onConflict: 'email' }).then(({ error }) => {
                if (error) console.error('[Auth] Initial profile sync failed', error);
            });
        }

        // Redirect user back to the dashboard / login
        res.send('<html><body><h2>Email Verified Successfully!</h2><p>You can now close this tab and log in to MerryMac.</p></body></html>');

    } catch (err) {
        res.status(401).send('Verification token is invalid or expired.');
    }
});

// 3. Login Route (Handles Standard Users & Admins)
router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = demoUserDB.get(email);

    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // In a real app we compare bcrypt hashes
    if (user.passwordHash !== password) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.verified) {
        return res.status(403).json({ error: 'Email not verified. Please check your inbox.' });
    }

    const token = generateSessionToken({
        id: `usr_auth_${Date.now()}`,
        email: email,
        role: user.role, // Inherits 'admin' for quasaralexander & qanvass, 'user' for others
        subscriptionPlan: user.role === 'admin' ? 'UNLIMITED' : 'TRIAL'
    });

    return res.json({ token, user: { email, role: user.role } });
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
