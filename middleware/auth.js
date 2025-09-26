const { cookieAuth } = require('./cookieAuth');
const { sanitizeOutput } = require('./dataEncryption');

// Enhanced authentication with cookie and session management
module.exports = cookieAuth;

// Middleware to sanitize response data based on user role
module.exports.sanitizeResponse = (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
        if (req.user && data) {
            try {
                const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                const sanitized = sanitizeOutput(parsed, req.user.role);
                return originalSend.call(this, JSON.stringify(sanitized));
            } catch (error) {
                return originalSend.call(this, data);
            }
        }
        return originalSend.call(this, data);
    };
    
    next();
};