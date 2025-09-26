/**
 * Async handler middleware to catch async errors automatically
 * Eliminates the need for try-catch blocks in every async route handler
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Async middleware wrapper for better error handling
 * Usage: app.get('/route', asyncHandler(async (req, res) => { ... }))
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

/**
 * Database operation wrapper with automatic connection handling
 */
const withDatabase = (fn) => {
    return async (req, res, next) => {
        try {
            const { connectToDatabase } = require('../utils/dbConnection');
            await connectToDatabase();
            return await fn(req, res, next);
        } catch (error) {
            console.error('Database operation error:', error);
            return res.status(500).json({
                success: false,
                error: 'Database operation failed',
                message: error.message
            });
        }
    };
};

/**
 * Performance monitoring wrapper
 */
const withPerformanceMonitoring = (fn) => {
    return async (req, res, next) => {
        const startTime = Date.now();
        
        try {
            const result = await fn(req, res, next);
            const duration = Date.now() - startTime;
            
            // Log slow requests (> 1 second)
            if (duration > 1000) {
                console.warn(`⚠️ Slow request: ${req.method} ${req.path} took ${duration}ms`);
            }
            
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`❌ Request failed: ${req.method} ${req.path} after ${duration}ms`, error);
            throw error;
        }
    };
};

/**
 * Combined wrapper for database operations with performance monitoring
 */
const withDatabaseAndMonitoring = (fn) => {
    return withPerformanceMonitoring(withDatabase(asyncHandler(fn)));
};

module.exports = {
    asyncHandler,
    catchAsync,
    withDatabase,
    withPerformanceMonitoring,
    withDatabaseAndMonitoring
};