const User = require('../models/User');
const UserManagementService = require('../services/userManagementService');
const UAParser = require('ua-parser-js');

// Middleware to track user activity
const trackUserActivity = async (req, res, next) => {
    if (req.user && req.user.id) {
        try {
            // Update last activity timestamp
            await User.findByIdAndUpdate(req.user.id, {
                'analytics.lastActivityAt': new Date()
            });

            // Clean up old devices periodically (1% chance per request)
            if (Math.random() < 0.01) {
                await UserManagementService.cleanupInactiveDevices(req.user.id);
            }
        } catch (error) {
            console.error('Error tracking user activity:', error);
        }
    }
    next();
};

// Middleware to detect and log failed login attempts
const trackFailedLogin = async (email, req) => {
    try {
        const parser = new UAParser(req.get('User-Agent'));
        const deviceData = {
            browser: parser.getBrowser().name,
            os: parser.getOS().name,
            device: parser.getDevice().type || 'desktop'
        };

        const loginEntry = {
            timestamp: new Date(),
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            success: false,
            failureReason: 'Invalid credentials',
            deviceInfo: deviceData
        };

        // Find user and add failed login attempt
        const user = await User.findOne({ email });
        if (user) {
            // Add to login history
            user.loginHistory.unshift(loginEntry);
            if (user.loginHistory.length > 50) {
                user.loginHistory = user.loginHistory.slice(0, 50);
            }

            // Increment login attempts
            user.accountStatus.loginAttempts = (user.accountStatus.loginAttempts || 0) + 1;

            // Lock account after 5 failed attempts
            if (user.accountStatus.loginAttempts >= 5) {
                user.accountStatus.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
            }

            await user.save();

            // Check for suspicious activity
            await UserManagementService.detectSuspiciousActivity(user._id, loginEntry);
        }
    } catch (error) {
        console.error('Error tracking failed login:', error);
    }
};

// Middleware to check if account is locked
const checkAccountLock = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) return next();

        const user = await User.findOne({ email });
        if (user && user.accountStatus.lockedUntil && user.accountStatus.lockedUntil > new Date()) {
            const remainingTime = Math.ceil((user.accountStatus.lockedUntil - new Date()) / (1000 * 60));
            return res.status(423).json({
                success: false,
                error: `Account is temporarily locked. Try again in ${remainingTime} minutes.`,
                lockedUntil: user.accountStatus.lockedUntil
            });
        }

        next();
    } catch (error) {
        console.error('Error checking account lock:', error);
        next();
    }
};

// Middleware to validate account status
const validateAccountStatus = async (req, res, next) => {
    if (req.user && req.user.id) {
        try {
            const user = await User.findById(req.user.id).select('accountStatus');
            
            if (!user.accountStatus.isActive) {
                return res.status(403).json({
                    success: false,
                    error: 'Account is deactivated. Please contact support.',
                    accountStatus: 'deactivated'
                });
            }

            if (user.accountStatus.isBlocked) {
                return res.status(403).json({
                    success: false,
                    error: 'Account is blocked. Please contact support.',
                    accountStatus: 'blocked'
                });
            }
        } catch (error) {
            console.error('Error validating account status:', error);
        }
    }
    next();
};

module.exports = {
    trackUserActivity,
    trackFailedLogin,
    checkAccountLock,
    validateAccountStatus
};