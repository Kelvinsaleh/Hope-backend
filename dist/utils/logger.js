"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
class Logger {
    constructor() {
        this.isDevelopment = process.env.NODE_ENV !== 'production';
    }
    formatLog(level, message, data) {
        return {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...(data && { data })
        };
    }
    log(level, message, data) {
        const logEntry = this.formatLog(level, message, data);
        if (this.isDevelopment) {
            console.log('[' + logEntry.timestamp + '] ' + level + ': ' + message);
            if (data) {
                console.log('Data:', data);
            }
        }
        else {
            console.log(JSON.stringify(logEntry));
        }
    }
    error(message, data) {
        this.log('ERROR', message, data);
    }
    warn(message, data) {
        this.log('WARN', message, data);
    }
    info(message, data) {
        this.log('INFO', message, data);
    }
    debug(message, data) {
        if (this.isDevelopment) {
            this.log('DEBUG', message, data);
        }
    }
}
exports.logger = new Logger();
exports.default = exports.logger;
