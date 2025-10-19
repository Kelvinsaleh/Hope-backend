"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.AppError = void 0;
const logger_1 = require("../utils/logger");
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
const errorHandler = (err, req, res, next) => {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            status: err.status,
            message: err.message,
            details: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
        });
    }
    // Log unexpected errors
    logger_1.logger.error("Unexpected error:", err);
    // Send generic error for unexpected errors
    return res.status(500).json({
        status: "error",
        message: "Something went wrong",
        details: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
    });
};
exports.errorHandler = errorHandler;
