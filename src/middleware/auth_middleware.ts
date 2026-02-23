import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

import { supabase } from '../services/supabase';

export interface AuthenticatedRequest extends Request {
    user?: any;
}

/**
 * Middleware to verify Supabase Auth JWTs.
 * Blocks requests that lack a valid Bearer token.
 */
export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn(`[AuthMiddleware] Unauthorized access attempt to ${req.originalUrl}`);
        return res.status(401).json({ error: 'Unauthorized. Missing or invalid Authorization header.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const secret = env.SUPABASE_SERVICE_ROLE_KEY || 'development_sso_secret_key_mock_123';
        const decoded = jwt.verify(token, secret) as any;

        req.user = {
            id: decoded.id || decoded.sub,
            email: decoded.email,
            role: decoded.role || 'user'
        };

        return next();
    } catch (error) {
        console.error(`[AuthMiddleware] Verification Failed:`, error);
        return res.status(403).json({ error: 'Forbidden. Invalid or expired token.' });
    }
};

/**
 * Optional Auth - parses token if it exists, but doesn't block if it's missing.
 */
export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    const token = authHeader.split(' ')[1];

    try {
        const secret = env.SUPABASE_SERVICE_ROLE_KEY || 'development_sso_secret_key_mock_123';
        const decoded = jwt.verify(token, secret) as any;
        req.user = {
            id: decoded.id || decoded.sub,
            email: decoded.email,
            role: decoded.role || 'user'
        };
    } catch (error) {
        // Ignore errors for optional auth
    }
    return next();
};
