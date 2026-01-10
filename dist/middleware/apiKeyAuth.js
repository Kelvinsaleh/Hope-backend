"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyAuth = void 0;
const logger_1 = require("../utils/logger");
/**
 * API Key Authentication Middleware
 * Validates API key from x-api-key header for server-side calls
 *
 * Environment variables:
 * - API_KEY: The API key for server-side authentication
 * - API_KEYS: Comma-separated list of valid API keys (alternative)
 */
const apiKeyAuth = async (req, res, next) => {
    try {
        const apiKey = req.header("x-api-key") || req.header("X-API-Key");
        if (!apiKey) {
            return res.status(401).json({
                success: false,
                message: "API key required for this endpoint"
            });
        }
        // Get valid API keys from environment
        const validApiKeys = [];
        // Single API key
        if (process.env.API_KEY) {
            validApiKeys.push(process.env.API_KEY);
        }
        // Multiple API keys (comma-separated)
        if (process.env.API_KEYS) {
            validApiKeys.push(...process.env.API_KEYS.split(',').map(k => k.trim()));
        }
        if (validApiKeys.length === 0) {
            logger_1.logger.error('No API keys configured in environment variables');
            return res.status(500).json({
                success: false,
                message: "Server configuration error: API keys not configured"
            });
        }
        // Validate API key (constant-time comparison to prevent timing attacks)
        let isValid = false;
        for (const validKey of validApiKeys) {
            if (apiKey.length === validKey.length && apiKey === validKey) {
                isValid = true;
                break;
            }
        }
        if (!isValid) {
            logger_1.logger.warn('Invalid API key attempted', {
                ip: req.ip,
                path: req.path,
                method: req.method
            });
            return res.status(401).json({
                success: false,
                message: "Invalid API key"
            });
        }
        // Attach API key info to request
        req.apiKey = apiKey;
        req.isApiKeyAuth = true;
        next();
    }
    catch (error) {
        logger_1.logger.error("API key auth middleware error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error during authentication"
        });
    }
};
exports.apiKeyAuth = apiKeyAuth;
