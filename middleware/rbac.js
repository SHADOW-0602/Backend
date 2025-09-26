// Role-Based Access Control (RBAC) System

// Define permissions for each role
const PERMISSIONS = {
    admin: [
        'user:read', 'user:write', 'user:delete',
        'driver:read', 'driver:write', 'driver:delete', 'driver:verify',
        'ride:read', 'ride:write', 'ride:delete', 'ride:manage',
        'vehicle:read', 'vehicle:write', 'vehicle:delete',
        'payment:read', 'payment:write', 'payment:refund',
        'analytics:read', 'analytics:write',
        'system:manage', 'system:config'
    ],
    driver: [
        'profile:read', 'profile:write',
        'ride:read', 'ride:accept', 'ride:update',
        'location:update',
        'earnings:read',
        'rating:read', 'rating:write'
    ],
    user: [
        'profile:read', 'profile:write',
        'ride:create', 'ride:read', 'ride:cancel',
        'payment:read', 'payment:create',
        'rating:read', 'rating:write',
        'invoice:read'
    ]
};

// Resource-based permissions
const RESOURCE_PERMISSIONS = {
    // Users can only access their own data
    'own_data': (req, resourceUserId) => {
        return req.user.id === resourceUserId;
    },
    
    // Drivers can access rides they're assigned to
    'assigned_ride': async (req, rideId) => {
        if (req.user.role !== 'driver') return false;
        const Ride = require('../models/Ride');
        const ride = await Ride.findById(rideId);
        return ride && ride.driver_id && ride.driver_id.toString() === req.user.id;
    },
    
    // Users can access rides they created
    'own_ride': async (req, rideId) => {
        if (req.user.role !== 'user') return false;
        const Ride = require('../models/Ride');
        const ride = await Ride.findById(rideId);
        return ride && ride.user_id.toString() === req.user.id;
    },
    
    // Admin can access everything
    'admin_access': (req) => {
        return req.user.role === 'admin';
    }
};

// Check if user has permission
const hasPermission = (userRole, permission) => {
    const rolePermissions = PERMISSIONS[userRole] || [];
    return rolePermissions.includes(permission);
};

// Permission middleware factory
const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        if (!hasPermission(req.user.role, permission)) {
            return res.status(403).json({
                success: false,
                error: `Access denied. Required permission: ${permission}`
            });
        }
        
        next();
    };
};

// Resource access middleware
const requireResourceAccess = (resourceType, getResourceId) => {
    return async (req, res, next) => {
        try {
            // Admin has access to everything
            if (req.user.role === 'admin') {
                return next();
            }
            
            const resourceId = typeof getResourceId === 'function' 
                ? getResourceId(req) 
                : req.params[getResourceId];
            
            const hasAccess = await RESOURCE_PERMISSIONS[resourceType](req, resourceId);
            
            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied to this resource'
                });
            }
            
            next();
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Error checking resource access'
            });
        }
    };
};

// Role hierarchy check
const roleHierarchy = {
    admin: 3,
    driver: 2,
    user: 1
};

const requireMinimumRole = (minimumRole) => {
    return (req, res, next) => {
        const userRoleLevel = roleHierarchy[req.user.role] || 0;
        const requiredLevel = roleHierarchy[minimumRole] || 0;
        
        if (userRoleLevel < requiredLevel) {
            return res.status(403).json({
                success: false,
                error: `Access denied. Minimum role required: ${minimumRole}`
            });
        }
        
        next();
    };
};

// Data filtering based on role
const filterDataByRole = (data, userRole, userId) => {
    switch (userRole) {
        case 'admin':
            return data; // Admin sees everything
            
        case 'driver':
            // Filter to show only driver's own data
            if (Array.isArray(data)) {
                return data.filter(item => 
                    item.driver_id?.toString() === userId ||
                    item.user_id?.toString() === userId
                );
            }
            return data;
            
        case 'user':
            // Filter to show only user's own data
            if (Array.isArray(data)) {
                return data.filter(item => 
                    item.user_id?.toString() === userId
                );
            }
            return data;
            
        default:
            return [];
    }
};

// Audit logging for sensitive operations
const auditLog = (action, resource) => {
    return (req, res, next) => {
        const originalSend = res.send;
        
        res.send = function(data) {
            // Log the action
            console.log(`[AUDIT] ${new Date().toISOString()} - User: ${req.user.id} (${req.user.role}) - Action: ${action} - Resource: ${resource} - IP: ${req.ip}`);
            
            // Call original send
            originalSend.call(this, data);
        };
        
        next();
    };
};

module.exports = {
    PERMISSIONS,
    RESOURCE_PERMISSIONS,
    hasPermission,
    requirePermission,
    requireResourceAccess,
    requireMinimumRole,
    filterDataByRole,
    auditLog
};