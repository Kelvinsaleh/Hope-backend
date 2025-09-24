"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRateLimiter = exports.aiChatRateLimiter = exports.generalRateLimiter = void 0;
const logger_1 = require("../utils/logger");
class RateLimiter {
    constructor(windowMs = 60000, maxRequests = 15) {
        this.store = {};
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        // Clean up expired entries every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
    cleanup() {
        const now = Date.now();
        Object.keys(this.store).forEach(key => {
            if (this.store[key].resetTime < now) {
                delete this.store[key];
            }
        });
    }
    getKey(req) {
        // Use user ID if authenticated, otherwise fall back to IP
        const userId = req.body?.userId || req.user?.id;
        return userId || req.ip || 'anonymous';
    }
    middleware() {
        return (req, res, next) => {
            const key = this.getKey(req);
            const now = Date.now();
            // Get or create rate limit entry
            if (!this.store[key] || now > this.store[key].resetTime) {
                this.store[key] = {
                    count: 1,
                    resetTime: now + this.windowMs
                };
                return next();
            }
            // Check if limit exceeded
            if (this.store[key].count >= this.maxRequests) {
                const resetTime = Math.ceil((this.store[key].resetTime - now) / 1000);
                logger_1.logger.warn(`Rate limit exceeded for ${key}`, {
                    count: this.store[key].count,
                    limit: this.maxRequests,
                    resetIn: resetTime
                });
                return res.status(429).json({
                    error: 'Rate limit exceeded. Please wait before making another request.',
                    retryAfter: resetTime,
                    limit: this.maxRequests,
                    windowMs: this.windowMs
                });
            }
            // Increment counter
            this.store[key].count++;
            // Add rate limit headers
            res.set({
                'X-RateLimit-Limit': this.maxRequests.toString(),
                'X-RateLimit-Remaining': (this.maxRequests - this.store[key].count).toString(),
                'X-RateLimit-Reset': new Date(this.store[key].resetTime).toISOString()
            });
            next();
        };
    }
}
// Create different rate limiters for different endpoints
exports.generalRateLimiter = new RateLimiter(60000, 30); // 30 requests per minute
exports.aiChatRateLimiter = new RateLimiter(60000, 10); // 10 requests per minute for AI chat
exports.authRateLimiter = new RateLimiter(900000, 5); // 5 requests per 15 minutes for auth 
