"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityLogging = exports.rateLimitHeaders = exports.securityHeaders = exports.requireAuth = void 0;
const logger_1 = require("../utils/logger");
/**
 * Security Middleware
 * Implements additional security checks and headers
 */
/**
 * Reject requests missing authentication (JWT or API key)
 * This should be applied after jwtOrApiKey middleware to ensure authentication exists
 */
const requireAuth = (req, res, next) => {
    const hasJWT = req.headers.authorization?.startsWith('Bearer ');
    const hasApiKey = req.headers['x-api-key'] || req.headers['X-API-Key'];
    if (!hasJWT && !hasApiKey) {
        return res.status(401).json({
            success: false,
            message: "Authentication required: Provide either JWT token (Authorization: Bearer <token>) or API key (x-api-key header)"
        });
    }
    next();
};
exports.requireAuth = requireAuth;
/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    // Remove potentially sensitive headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    next();
};
exports.securityHeaders = securityHeaders;
/**
 * Rate limiting header (complement to rate limiter middleware)
 */
const rateLimitHeaders = (req, res, next) => {
    // These will be set by the rate limiter middleware if used
    // This is just a placeholder for additional rate limit headers
    next();
};
exports.rateLimitHeaders = rateLimitHeaders;
/**
 * Request logging for security monitoring
 */
const securityLogging = (req, res, next) => {
    // Log suspicious or important requests
    const ip = req.ip || req.socket.remoteAddress;
    const method = req.method;
    const path = req.path;
    const userAgent = req.headers['user-agent'];
    // Log failed authentication attempts
    if (path.includes('/auth') && (method === 'POST' || method === 'PUT')) {
        logger_1.logger.info('Authentication attempt', {
            ip,
            method,
            path,
            userAgent,
            timestamp: new Date().toISOString(),
        });
    }
    // Log admin endpoints access
    if (path.includes('/admin')) {
        logger_1.logger.warn('Admin endpoint access', {
            ip,
            method,
            path,
            userAgent,
            hasAuth: !!(req.headers.authorization || req.headers['x-api-key']),
            timestamp: new Date().toISOString(),
        });
    }
    next();
};
exports.securityLogging = securityLogging;
