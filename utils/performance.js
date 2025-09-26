/**
 * Performance optimization utilities for Vercel deployment
 */

/**
 * Memory usage monitoring
 */
const getMemoryUsage = () => {
    const usage = process.memoryUsage();
    return {
        rss: Math.round(usage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
        external: Math.round(usage.external / 1024 / 1024), // MB
        arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024) // MB
    };
};

/**
 * Request timing middleware
 */
const requestTimer = (req, res, next) => {
    req.startTime = Date.now();
    
    const originalSend = res.send;
    res.send = function(data) {
        const duration = Date.now() - req.startTime;
        res.set('X-Response-Time', `${duration}ms`);
        
        // Log slow requests
        if (duration > 1000) {
            console.warn(`⚠️ Slow request: ${req.method} ${req.path} - ${duration}ms`);
        }
        
        return originalSend.call(this, data);
    };
    
    next();
};

/**
 * Cache headers for static content
 */
const setCacheHeaders = (req, res, next) => {
    // Cache static assets for 1 hour
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
        res.set('Cache-Control', 'public, max-age=3600');
    }
    // Cache API responses for 5 minutes
    else if (req.path.startsWith('/api/')) {
        res.set('Cache-Control', 'public, max-age=300');
    }
    
    next();
};

/**
 * Compression middleware for better performance
 */
const enableCompression = () => {
    try {
        const compression = require('compression');
        return compression({
            level: 6,
            threshold: 1024,
            filter: (req, res) => {
                if (req.headers['x-no-compression']) {
                    return false;
                }
                return compression.filter(req, res);
            }
        });
    } catch (error) {
        console.warn('⚠️ Compression middleware not available:', error.message);
        return (req, res, next) => next();
    }
};

/**
 * Request size limiter
 */
const requestSizeLimiter = (maxSize = '10mb') => {
    return (req, res, next) => {
        const contentLength = parseInt(req.headers['content-length']);
        const maxBytes = parseSize(maxSize);
        
        if (contentLength && contentLength > maxBytes) {
            return res.status(413).json({
                success: false,
                error: 'Request entity too large',
                maxSize
            });
        }
        
        next();
    };
};

/**
 * Parse size string to bytes
 */
const parseSize = (size) => {
    const units = {
        'b': 1,
        'kb': 1024,
        'mb': 1024 * 1024,
        'gb': 1024 * 1024 * 1024
    };
    
    const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2] || 'b';
    
    return Math.floor(value * units[unit]);
};

/**
 * Database query optimization
 */
const optimizeQuery = (query) => {
    return query
        .lean() // Return plain objects instead of Mongoose documents
        .maxTimeMS(5000) // Set maximum execution time
        .hint({ _id: 1 }); // Use index hint when appropriate
};

/**
 * Batch operations helper
 */
const batchProcess = async (items, batchSize = 100, processor) => {
    const results = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(item => processor(item))
        );
        results.push(...batchResults);
    }
    
    return results;
};

/**
 * Connection pool monitoring
 */
const monitorConnectionPool = () => {
    const mongoose = require('mongoose');
    
    return {
        totalConnections: mongoose.connection.db?.serverConfig?.connections?.length || 0,
        availableConnections: mongoose.connection.db?.serverConfig?.availableConnections?.length || 0,
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        name: mongoose.connection.name
    };
};

/**
 * Performance metrics collector
 */
const collectMetrics = () => {
    return {
        memory: getMemoryUsage(),
        uptime: process.uptime(),
        cpuUsage: process.cpuUsage(),
        connectionPool: monitorConnectionPool(),
        timestamp: new Date().toISOString()
    };
};

/**
 * Async operation timeout wrapper
 */
const withTimeout = (promise, timeoutMs = 10000) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Operation timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        })
    ]);
};

module.exports = {
    getMemoryUsage,
    requestTimer,
    setCacheHeaders,
    enableCompression,
    requestSizeLimiter,
    optimizeQuery,
    batchProcess,
    monitorConnectionPool,
    collectMetrics,
    withTimeout
};