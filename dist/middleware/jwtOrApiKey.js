"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jwtOrApiKey = void 0;
const auth_1 = require("./auth");
const apiKeyAuth_1 = require("./apiKeyAuth");
/**
 * Combined Authentication Middleware
 * Accepts either JWT (Bearer token) OR API key (x-api-key header)
 *
 * Priority:
 * 1. Check for API key first (for server-side calls)
 * 2. Fall back to JWT token (for user authentication)
 * 3. Reject if neither is provided
 */
const jwtOrApiKey = async (req, res, next) => {
    const apiKey = req.header("x-api-key") || req.header("X-API-Key");
    const authHeader = req.header("Authorization");
    const hasJWT = authHeader && authHeader.startsWith("Bearer ");
    // Security: Require at least one authentication method
    if (!apiKey && !hasJWT) {
        return res.status(401).json({
            success: false,
            message: "Authentication required: Provide either JWT token (Authorization: Bearer <token>) or API key (x-api-key header)"
        });
    }
    // If API key is provided, validate it
    if (apiKey) {
        // Use API key authentication
        return (0, apiKeyAuth_1.apiKeyAuth)(req, res, next);
    }
    // Otherwise, use JWT authentication
    if (hasJWT) {
        return (0, auth_1.auth)(req, res, next);
    }
    // This should never be reached due to the check above, but just in case
    return res.status(401).json({
        success: false,
        message: "Authentication required"
    });
};
exports.jwtOrApiKey = jwtOrApiKey;
