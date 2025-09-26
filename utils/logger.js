const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, 'app.log');
const errorFile = path.join(logsDir, 'error.log');

const formatLog = (level, message, data = null) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...(data && { data })
    };
    return JSON.stringify(logEntry) + '\n';
};

const writeToFile = (file, content) => {
    try {
        fs.appendFileSync(file, content);
    } catch (err) {
        console.error('Failed to write to log file:', err);
    }
};

const logger = {
    info: (message, data) => {
        const log = formatLog('INFO', message, data);
        console.log(`[INFO] ${message}`, data || '');
        writeToFile(logFile, log);
    },
    
    warn: (message, data) => {
        const log = formatLog('WARN', message, data);
        console.warn(`[WARN] ${message}`, data || '');
        writeToFile(logFile, log);
    },
    
    error: (message, data) => {
        const log = formatLog('ERROR', message, data);
        console.error(`[ERROR] ${message}`, data || '');
        writeToFile(errorFile, log);
        writeToFile(logFile, log);
    },
    
    debug: (message, data) => {
        if (process.env.NODE_ENV === 'development') {
            const log = formatLog('DEBUG', message, data);
            console.log(`[DEBUG] ${message}`, data || '');
            writeToFile(logFile, log);
        }
    }
};

module.exports = logger;