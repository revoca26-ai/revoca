import pino from 'pino';

// Create a Pino logger instance
export const logger = pino({
    // In production, we just want raw JSON logs. 
    // But in development (when running locally), we want it to look nice in the terminal!
    transport: process.env.NODE_ENV !== 'production' 
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
            },
        } 
        : undefined,
    level: process.env.LOG_LEVEL || 'info',
});
