import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

/**
 * Security Middleware
 * Implements additional security checks and headers
 */

/**
 * Reject requests missing authentication (JWT or API key)
 * This should be applied after jwtOrApiKey middleware to ensure authentication exists
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
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

/**
 * Security headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
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

/**
 * Rate limiting header (complement to rate limiter middleware)
 */
export const rateLimitHeaders = (req: Request, res: Response, next: NextFunction) => {
  // These will be set by the rate limiter middleware if used
  // This is just a placeholder for additional rate limit headers
  next();
};

/**
 * Request logging for security monitoring
 */
export const securityLogging = (req: Request, res: Response, next: NextFunction) => {
  // Log suspicious or important requests
  const ip = req.ip || req.socket.remoteAddress;
  const method = req.method;
  const path = req.path;
  const userAgent = req.headers['user-agent'];
  
  // Log failed authentication attempts
  if (path.includes('/auth') && (method === 'POST' || method === 'PUT')) {
    logger.info('Authentication attempt', {
      ip,
      method,
      path,
      userAgent,
      timestamp: new Date().toISOString(),
    });
  }
  
  // Log admin endpoints access
  if (path.includes('/admin')) {
    logger.warn('Admin endpoint access', {
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

