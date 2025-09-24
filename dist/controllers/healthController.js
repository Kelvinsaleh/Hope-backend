"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readinessCheck = exports.healthCheck = void 0;
const logger_1 = require("../utils/logger");
const healthCheck = async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development'
        };
        res.status(200).json(health);
    }
    catch (error) {
        logger_1.logger.error('Health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.healthCheck = healthCheck;
const readinessCheck = async (req, res) => {
    try {
        // Check if critical services are available
        // You can add database connectivity checks here
        res.status(200).json({
            status: 'ready',
            timestamp: new Date().toISOString(),
            checks: {
                database: 'connected', // You can implement actual DB check
                ai_service: 'available'
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Readiness check failed:', error);
        res.status(503).json({
            status: 'not ready',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.readinessCheck = readinessCheck;
