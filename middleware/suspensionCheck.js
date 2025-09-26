const Driver = require('../models/Driver');

// Middleware to check if driver is suspended
const checkDriverSuspension = async (req, res, next) => {
    try {
        // Only check for drivers
        if (req.user && req.user.role === 'driver') {
            const driver = await Driver.findById(req.user.id).select('suspension status');
            
            if (!driver) {
                return res.status(404).json({
                    success: false,
                    error: 'Driver not found'
                });
            }
            
            // Check if driver is suspended
            if (driver.suspension && driver.suspension.isSuspended) {
                const suspensionData = driver.suspension;
                
                // Check if temporary suspension has expired
                if (suspensionData.suspensionType === 'temporary' && 
                    suspensionData.suspensionEndDate && 
                    new Date() > suspensionData.suspensionEndDate) {
                    
                    // Auto-unsuspend if suspension period has ended
                    await Driver.findByIdAndUpdate(req.user.id, {
                        status: 'offline',
                        'suspension.isSuspended': false,
                        'suspension.suspendedAt': null,
                        'suspension.suspendedBy': null,
                        'suspension.reason': null,
                        'suspension.suspensionType': null,
                        'suspension.suspensionEndDate': null
                    });
                    
                    // Send unsuspension email for auto-unsuspension
                    try {
                        const emailService = require('../services/emailService');
                        await emailService.sendDriverUnsuspensionEmail(driver);
                    } catch (error) {
                        console.error('Error sending auto-unsuspension email:', error);
                    }
                    
                    return next();
                }
                
                // Driver is still suspended
                return res.status(403).json({
                    success: false,
                    error: 'Account suspended',
                    suspended: true,
                    suspensionData: {
                        reason: suspensionData.reason,
                        suspensionType: suspensionData.suspensionType,
                        suspendedAt: suspensionData.suspendedAt,
                        suspensionEndDate: suspensionData.suspensionEndDate,
                        isPermanent: suspensionData.suspensionType === 'permanent'
                    }
                });
            }
        }
        
        next();
    } catch (error) {
        console.error('Error checking driver suspension:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
};

// Middleware specifically for ride-related endpoints
const checkDriverSuspensionForRides = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'driver') {
            // Try to find driver by ID first, then by originalUserId
            let driver = await Driver.findById(req.user.id).select('suspension status');
            
            if (!driver) {
                // If not found by ID, try to find by originalUserId or email
                const User = require('../models/User');
                const user = await User.findById(req.user.id);
                if (user) {
                    driver = await Driver.findOne({ 
                        $or: [
                            { originalUserId: req.user.id },
                            { email: user.email }
                        ]
                    }).select('suspension status');
                }
            }
            
            if (driver && driver.suspension && driver.suspension.isSuspended) {
                return res.status(403).json({
                    success: false,
                    error: 'Cannot access ride services while suspended',
                    suspended: true,
                    showPopup: true,
                    popupMessage: `Your account has been suspended. Reason: ${driver.suspension.reason}. Please contact support for assistance.`,
                    suspensionData: {
                        reason: driver.suspension.reason,
                        suspensionType: driver.suspension.suspensionType,
                        suspendedAt: driver.suspension.suspendedAt,
                        suspensionEndDate: driver.suspension.suspensionEndDate
                    }
                });
            }
        }
        next();
    } catch (error) {
        console.error('Error checking driver suspension for rides:', error);
        next(); // Continue even if suspension check fails
    }
};

module.exports = {
    checkDriverSuspension,
    checkDriverSuspensionForRides
};