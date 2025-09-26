const { requireMinimumRole, auditLog } = require('./rbac');

module.exports = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Access denied. Authentication required.',
                code: 'AUTH_REQUIRED'
            });
        }
        
        if (!allowedRoles.includes(req.user.role)) {
            // Log unauthorized access attempt
            console.warn(`[SECURITY] Unauthorized access attempt - User: ${req.user.id} (${req.user.role}) - Required: ${allowedRoles.join('|')} - IP: ${req.ip}`);
            
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied. Insufficient permissions.',
                code: 'INSUFFICIENT_PERMISSIONS',
                required: allowedRoles
            });
        }
        
        next();
    };
};

// Export RBAC functions for direct use
module.exports.requireMinimumRole = requireMinimumRole;
module.exports.auditLog = auditLog;