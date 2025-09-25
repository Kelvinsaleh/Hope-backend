interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
}

class Logger {
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
  }

  private formatLog(level: string, message: string, data?: any): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(data && { data })
    };
  }

  private log(level: string, message: string, data?: any): void {
    const logEntry = this.formatLog(level, message, data);
    
    if (this.isDevelopment) {
      console.log('[' + logEntry.timestamp + '] ' + level + ': ' + message);
      if (data) {
        console.log('Data:', data);
      }
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }

  error(message: string, data?: any): void {
    this.log('ERROR', message, data);
  }

  warn(message: string, data?: any): void {
    this.log('WARN', message, data);
  }

  info(message: string, data?: any): void {
    this.log('INFO', message, data);
  }

  debug(message: string, data?: any): void {
    if (this.isDevelopment) {
      this.log('DEBUG', message, data);
    }
  }
}

export const logger = new Logger();
export default logger;
