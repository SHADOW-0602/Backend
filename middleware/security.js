// Fallback security middleware that works with or without optional dependencies

// Try to load optional security packages
let rateLimit, helmet, mongoSanitize, xss, hpp;

try {
    rateLimit = require('express-rate-limit');
} catch (e) {
    console.warn('⚠️  express-rate-limit not installed. Rate limiting disabled.');
}

try {
    helmet = require('helmet');
} catch (e) {
    console.warn('⚠️  helmet not installed. Security headers limited.');
}

try {
    mongoSanitize = require('express-mongo-sanitize');
} catch (e) {
    console.warn('⚠️  express-mongo-sanitize not installed. NoSQL injection protection disabled.');
}

try {
    xss = require('xss-clean');
} catch (e) {
    console.warn('⚠️  xss-clean not installed. XSS protection limited.');
}

try {
    hpp = require('hpp');
} catch (e) {
    console.warn('⚠️  hpp not installed. Parameter pollution protection disabled.');
}

// Rate limiting configurations
const createRateLimit = (windowMs, max, message) => {
    if (!rateLimit) {
        // Fallback rate limiter using in-memory store
        const requests = new Map();
        
        return (req, res, next) => {
            const key = req.ip || req.connection.remoteAddress;
            const now = Date.now();
            const windowStart = now - windowMs;
            
            // Clean old entries
            if (requests.has(key)) {
                const userRequests = requests.get(key).filter(time => time > windowStart);
                requests.set(key, userRequests);
            }
            
            const userRequests = requests.get(key) || [];
            
            if (userRequests.length >= max) {
                return res.status(429).json({ success: false, error: message });
            }
            
            userRequests.push(now);
            requests.set(key, userRequests);
            next();
        };
    }
    
    return rateLimit({
        windowMs,
        max,
        message: { success: false, error: message },
        standardHeaders: true,
        legacyHeaders: false
    });
};

// General API rate limit
exports.generalLimiter = createRateLimit(
    15 * 60 * 1000, // 15 minutes
    1000, // 1000 requests per window
    'Too many requests, please try again later'
);

// Auth rate limit (stricter)
exports.authLimiter = createRateLimit(
    15 * 60 * 1000, // 15 minutes
    5, // 5 attempts per window
    'Too many login attempts, please try again later'
);

// Admin rate limit (very strict)
exports.adminLimiter = createRateLimit(
    15 * 60 * 1000, // 15 minutes
    3, // 3 attempts per window
    'Too many admin login attempts, account temporarily locked'
);

// Security headers
exports.securityHeaders = helmet ? helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false
}) : (req, res, next) => {
    // Fallback security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
};

// Data sanitization
const sanitizeMiddleware = [];

if (mongoSanitize) {
    sanitizeMiddleware.push(mongoSanitize());
} else {
    // Basic NoSQL injection protection
    sanitizeMiddleware.push((req, res, next) => {
        const sanitize = (obj) => {
            if (obj && typeof obj === 'object') {
                for (const key in obj) {
                    if (key.startsWith('$') || key.includes('.')) {
                        delete obj[key];
                    } else if (typeof obj[key] === 'object') {
                        sanitize(obj[key]);
                    }
                }
            }
        };
        
        sanitize(req.body);
        sanitize(req.query);
        sanitize(req.params);
        next();
    });
}

if (xss) {
    sanitizeMiddleware.push(xss());
} else {
    // Basic XSS protection
    sanitizeMiddleware.push((req, res, next) => {
        const cleanXSS = (obj) => {
            if (typeof obj === 'string') {
                return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            }
            if (obj && typeof obj === 'object') {
                for (const key in obj) {
                    obj[key] = cleanXSS(obj[key]);
                }
            }
            return obj;
        };
        
        req.body = cleanXSS(req.body);
        req.query = cleanXSS(req.query);
        next();
    });
}

if (hpp) {
    sanitizeMiddleware.push(hpp());
}

exports.sanitizeData = sanitizeMiddleware;

// IP whitelist middleware
exports.ipWhitelist = (allowedIPs = []) => {
    return (req, res, next) => {
        if (allowedIPs.length === 0) return next();
        
        const clientIP = req.ip || req.connection.remoteAddress;
        if (!allowedIPs.includes(clientIP)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied from this IP address'
            });
        }
        next();
    };
};