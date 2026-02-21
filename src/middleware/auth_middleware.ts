import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
    };
}

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Get the auth header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn(`[AuthMiddleware] Unauthorized access attempt to ${req.originalUrl}`);
        return res.status(401).json({ error: 'Unauthorized. Missing or invalid Authorization header.' });
    }

    // 2. Extract the token
    const token = authHeader.split(' ')[1];

    try {
        // 3. Verify the token using the secret map
        // We use SUPABASE_SERVICE_ROLE_KEY or a dedicated JWT_SECRET as the signing key
        const secret = env.SUPABASE_SERVICE_ROLE_KEY || 'development_sso_secret_key_mock_123';

        const decoded = jwt.verify(token, secret) as any;

        // 4. Attach user payload to request
        req.user = {
            id: decoded.id || decoded.sub,
            email: decoded.email,
            role: decoded.role || 'user'
        };

        next();
    } catch (error) {
        console.error(`[AuthMiddleware] JWT Verification Failed:`, error);
        return res.status(403).json({ error: 'Forbidden. Invalid or expired token.' });
    }
};

/**
 * Optional Auth - parses token if it exists, but doesn't block if it's missing.
 */
export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
    next();
};
