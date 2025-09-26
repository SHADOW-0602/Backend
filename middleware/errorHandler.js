// Middleware: Global error handler
const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
    const errorInfo = {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString(),
        userId: req.user?.id || 'anonymous'
    };

    if (res.headersSent) {
        logger.error('[ErrorHandler] Headers already sent:', errorInfo);
        return next(err);
    }

    let status = 500;
    let message = 'Internal Server Error';
    let errorCode = 'INTERNAL_ERROR';

    if (err.name === 'ValidationError') {
        status = 400;
        message = Object.values(err.errors).map(e => e.message).join(', ');
        errorCode = 'VALIDATION_ERROR';
    } else if (err.name === 'CastError') {
        status = 400;
        message = 'Invalid ID format';
        errorCode = 'INVALID_ID';
    } else if (err.code === 11000) {
        status = 409;
        message = 'Duplicate field value';
        errorCode = 'DUPLICATE_ERROR';
    } else if (err.name === 'JsonWebTokenError') {
        status = 401;
        message = 'Invalid token';
        errorCode = 'INVALID_TOKEN';
    } else if (err.status) {
        status = err.status;
        message = err.message;
        errorCode = err.code || 'CUSTOM_ERROR';
    }

    if (status >= 500) {
        logger.error('[ErrorHandler] Server Error:', { ...errorInfo, status, errorCode });
    } else {
        logger.warn('[ErrorHandler] Client Error:', { ...errorInfo, status, errorCode });
    }

    res.status(status).json({
        success: false,
        message,
        errorCode,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};