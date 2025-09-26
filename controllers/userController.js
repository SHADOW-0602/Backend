const User = require('../models/User');
const Driver = require('../models/Driver');
const Admin = require('../models/Admin');

const SupportTicket = require('../models/SupportTicket');
const Ride = require('../models/Ride');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const multer = require('multer');
const { SessionManager } = require('../middleware/sessionManager');
const UAParser = require('ua-parser-js');
const UserManagementService = require('../services/userManagementService');
const { trackFailedLogin } = require('../middleware/userActivity');
const { setAuthCookie, clearAuthCookie, clearAllAuthCookies } = require('../middleware/cookieAuth');
const { updateDriverLocation, updateDriverLocationInFile } = require('../services/locationService');
const { sanitizeOutput, maskSensitiveData } = require('../middleware/dataEncryption');

const emailService = require('../services/emailService');
require('../services/marketingService'); // Initialize marketing scheduler

exports.register = async (req, res) => {
    try {
        const { name, email, password, phone, role, driverInfo } = req.body;
        
        // Check if email exists in any collection
        const [existingUser, existingDriver, existingAdmin] = await Promise.all([
            User.findOne({ email }),
            Driver.findOne({ email }),
            Admin.findOne({ email })
        ]);
        
        if (existingUser || existingDriver || existingAdmin) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }
        
        // Check if phone number exists in any collection
        const [existingUserPhone, existingDriverPhone] = await Promise.all([
            User.findOne({ phone }),
            Driver.findOne({ phone })
        ]);
        
        if (existingUserPhone || existingDriverPhone) {
            return res.status(400).json({ success: false, error: 'Phone number already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        if (role === 'driver') {
            // Validate vehicle type
            if (driverInfo && driverInfo.vehicleType && !['bike', 'sedan', 'suv'].includes(driverInfo.vehicleType)) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid vehicle type. Must be one of: bike, sedan, suv' 
                });
            }
            
            // Validate registration number
            if (!driverInfo || !driverInfo.registrationNumber) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Vehicle registration number is required for drivers' 
                });
            }
            
            const driverData = {
                name,
                email,
                phone,
                password: hashedPassword,
                driverInfo
            };
            const driver = await Driver.create(driverData);
            
            // Create vehicle entry for the driver
            if (driverInfo && driverInfo.registrationNumber) {
                try {
                    const vehicleData = {
                        make: driverInfo.vehicleMake || 'Unknown',
                        model: driverInfo.vehicleModel || 'Unknown',
                        year: driverInfo.vehicleYear || new Date().getFullYear(),
                        license_plate: driverInfo.registrationNumber,
                        driver_id: driver._id,
                        fare_per_km: 15, // Default fare
                        vehicle_type: driverInfo.vehicleType === 'luxury' ? 'premium' : 
                                     driverInfo.vehicleType === 'suv' ? 'standard' : 'economy',
                        owner: {
                            name: driver.name,
                            email: driver.email,
                            phone: driver.phone
                        },
                        color: driverInfo.vehicleColor || 'Unknown',
                        registration_number: driverInfo.registrationNumber,
                        status: 'active'
                    };
                    

                } catch (vehicleError) {
                    console.error('Failed to create vehicle for driver:', vehicleError);
                    // Don't fail driver registration if vehicle creation fails
                }
            }
            
            // Send welcome email to new driver
            try {
                await emailService.sendWelcomeEmail(driver, 'driver');
            } catch (emailError) {
                console.error('Failed to send driver welcome email:', emailError);
            }
            
            return res.json({ success: true, user: sanitizeOutput(driver, 'driver') });
        } else {
            const userData = {
                name,
                email,
                phone,
                password: hashedPassword
            };
            const user = await User.create(userData);
            
            // Send welcome email to new user
            try {
                await emailService.sendWelcomeEmail(user, 'user');
            } catch (emailError) {
                console.error('Failed to send user welcome email:', emailError);
            }
            
            return res.json({ success: true, user: sanitizeOutput(user, 'user') });
        }
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, error: 'Email already exists in the system' });
        }
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password, secretKey } = req.body;
        console.log(`[LOGIN] Attempt for email: ${encodeURIComponent(email?.substring(0, 3) || 'unknown')}***`);
        
        // Check all user types in parallel for better performance
        const [admin, driver, user] = await Promise.all([
            Admin.findOne({ email }),
            Driver.findOne({ email }),
            User.findOne({ email })
        ]);
        
        // Check admin login first
        if (admin) {
            const passwordMatch = await bcrypt.compare(password, admin.password);
            if (!passwordMatch) {
                console.warn(`[SECURITY] Failed admin login attempt - ${maskSensitiveData({email}).email} - IP: ${encodeURIComponent(req.ip)}`);
                return res.status(401).json({ success: false, error: 'Invalid credentials' });
            }
            
            if (!secretKey) {
                return res.status(200).json({ 
                    success: true,
                    requiresSecretKey: true, 
                    message: 'Please enter admin secret key' 
                });
            }
            
            const secretMatch = await bcrypt.compare(secretKey, admin.secretKey);
            if (!secretMatch) {
                console.warn(`[SECURITY] Invalid admin secret key - ${encodeURIComponent(admin.email)} - IP: ${encodeURIComponent(req.ip)}`);
                return res.status(401).json({ success: false, error: 'Invalid secret key' });
            }
            
            const deviceInfo = {
                userAgent: req.get('User-Agent'),
                ip: req.ip
            };
            const { token, sessionId } = SessionManager.generateSessionToken(admin._id, 'admin', deviceInfo);
            
            // Set secure cookie
            setAuthCookie(res, token, 'admin');
            
            console.log(`[SECURITY] Admin login successful - ${encodeURIComponent(admin.email)} - IP: ${encodeURIComponent(req.ip)}`);
            return res.json({ 
                success: true,
                token, 
                user: sanitizeOutput(admin, 'admin'),
                sessionId
            });
        }
        
        // Check driver login (already fetched)
        if (driver) {
            const match = await bcrypt.compare(password, driver.password);
            if (!match) {
                console.warn(`[SECURITY] Failed driver login - ${maskSensitiveData({email}).email} - IP: ${encodeURIComponent(req.ip)}`);
                return res.status(401).json({ success: false, error: 'Invalid credentials' });
            }
            
            // Check if driver is suspended
            if (driver.suspension && driver.suspension.isSuspended) {
                // Check if temporary suspension has expired
                if (driver.suspension.suspensionType === 'temporary' && 
                    driver.suspension.suspensionEndDate && 
                    new Date() > driver.suspension.suspensionEndDate) {
                    
                    // Auto-unsuspend
                    await Driver.findByIdAndUpdate(driver._id, {
                        status: 'offline',
                        'suspension.isSuspended': false,
                        'suspension.suspendedAt': null,
                        'suspension.suspendedBy': null,
                        'suspension.reason': null,
                        'suspension.suspensionType': null,
                        'suspension.suspensionEndDate': null
                    });
                    
                    // Send unsuspension email
                    try {
                        await emailService.sendDriverUnsuspensionEmail(driver);
                    } catch (error) {
                        console.error('Error sending auto-unsuspension email:', error);
                    }
                } else {
                    // Driver is still suspended
                    return res.status(403).json({
                        success: false,
                        error: 'Account suspended',
                        suspended: true,
                        suspensionData: {
                            reason: driver.suspension.reason,
                            suspensionType: driver.suspension.suspensionType,
                            suspendedAt: driver.suspension.suspendedAt,
                            suspensionEndDate: driver.suspension.suspensionEndDate,
                            isPermanent: driver.suspension.suspensionType === 'permanent'
                        }
                    });
                }
            }
            
            const deviceInfo = {
                userAgent: req.get('User-Agent'),
                ip: req.ip
            };
            const { token, sessionId } = SessionManager.generateSessionToken(driver._id, 'driver', deviceInfo);
            
            // Set secure cookie
            setAuthCookie(res, token, 'driver');
            
            return res.json({ 
                success: true,
                token, 
                user: sanitizeOutput(driver, 'driver'),
                sessionId
            });
        }
        
        // Check user login (already fetched)
        if (user) {
            // Check if user was migrated to driver
            if (user.driverApplication && user.driverApplication.status === 'approved') {
                return res.status(200).json({ 
                    success: true,
                    migrated: true,
                    message: 'Your account has been migrated to driver. Please use driver login.'
                });
            }
            
            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                console.warn(`[SECURITY] Failed user login - ${maskSensitiveData({email}).email} - IP: ${encodeURIComponent(req.ip)}`);
                return res.status(401).json({ success: false, error: 'Invalid credentials' });
            }
            
            // Check if 2FA is enabled
            if (user.twoFactorEnabled) {
                const { twoFactorCode } = req.body;
                if (!twoFactorCode) {
                    return res.status(200).json({ 
                        success: true,
                        requires2FA: true,
                        message: 'Please enter your 2FA code'
                    });
                }
                
                const verified = speakeasy.totp.verify({
                    secret: user.twoFactorSecret,
                    encoding: 'base32',
                    token: twoFactorCode,
                    window: 2
                });
                
                if (!verified) {
                    return res.status(401).json({ success: false, error: 'Invalid 2FA code' });
                }
            }
            
            const deviceInfo = {
                userAgent: req.get('User-Agent'),
                ip: req.ip
            };
            
            // Parse user agent for device info
            const parser = new UAParser(req.get('User-Agent'));
            const deviceData = {
                browser: parser.getBrowser().name,
                os: parser.getOS().name,
                device: parser.getDevice().type || 'desktop'
            };
            
            // Update login history
            const loginEntry = {
                timestamp: new Date(),
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                success: true,
                deviceInfo: deviceData
            };
            
            // Update device info
            const deviceId = `${deviceData.browser}_${deviceData.os}_${req.ip}`.replace(/\s+/g, '_');
            const existingDevice = user.devices.find(d => d.deviceId === deviceId);
            
            if (!existingDevice) {
                user.devices.push({
                    deviceId,
                    deviceName: `${deviceData.browser} on ${deviceData.os}`,
                    deviceType: deviceData.device,
                    browser: deviceData.browser,
                    os: deviceData.os,
                    ip: req.ip,
                    lastUsed: new Date(),
                    isActive: true
                });
            } else {
                existingDevice.lastUsed = new Date();
                existingDevice.isActive = true;
            }
            
            // Add to login history (keep last 50 entries)
            user.loginHistory.unshift(loginEntry);
            if (user.loginHistory.length > 50) {
                user.loginHistory = user.loginHistory.slice(0, 50);
            }
            
            // Update account status
            user.accountStatus.lastLoginAt = new Date();
            user.accountStatus.loginAttempts = 0;
            user.analytics.lastActivityAt = new Date();
            
            await user.save();
            
            const { token, sessionId } = SessionManager.generateSessionToken(user._id, 'user', deviceInfo);
            
            // Set secure cookie
            setAuthCookie(res, token, 'user');
            
            return res.json({ 
                success: true,
                token, 
                user: sanitizeOutput(user, 'user'),
                sessionId
            });
        }
        
        console.warn(`[SECURITY] Login attempt with non-existent email: ${maskSensitiveData({email}).email} - IP: ${encodeURIComponent(req.ip)}`);
        
        // Track failed login attempt
        await trackFailedLogin(email, req);
        
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.getProfile = async (req, res) => {
    try {
        let user;
        if (req.user.role === 'admin') {
            user = await Admin.findById(req.user.id).select('-password -secretKey');
        } else if (req.user.role === 'driver') {
            user = await Driver.findById(req.user.id).select('-password');
        } else {
            user = await User.findById(req.user.id).select('-password');
        }
        res.json({ success: true, user: sanitizeOutput(user, req.user.role) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        // Allowlist of updatable fields to prevent mass assignment
        const allowedFields = ['name', 'phone', 'password'];
        const updates = {};
        
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });
        
        if (updates.password) {
            updates.password = await bcrypt.hash(updates.password, 10);
        }
        
        let user;
        if (req.user.role === 'admin') {
            user = await Admin.findByIdAndUpdate(req.user.id, updates, { new: true });
        } else if (req.user.role === 'driver') {
            user = await Driver.findByIdAndUpdate(req.user.id, updates, { new: true });
        } else {
            user = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
        }
        res.json({ success: true, user: sanitizeOutput(user, req.user.role) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        let user;
        if (req.user.role === 'admin') {
            user = await Admin.findById(req.user.id);
        } else if (req.user.role === 'driver') {
            user = await Driver.findById(req.user.id);
        } else {
            user = await User.findById(req.user.id);
        }
        
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ success: false, error: 'Current password is incorrect' });
        }
        
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ success: false, error: 'New password must be different from current password' });
        }
        
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        
        if (req.user.role === 'admin') {
            await Admin.findByIdAndUpdate(req.user.id, { password: hashedNewPassword });
        } else if (req.user.role === 'driver') {
            await Driver.findByIdAndUpdate(req.user.id, { password: hashedNewPassword });
        } else {
            await User.findByIdAndUpdate(req.user.id, { password: hashedNewPassword });
        }
        
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.updateLocation = async (req, res) => {
    try {
        const { latitude, longitude, address, status = 'available' } = req.body;
        const location = { latitude, longitude, address };
        
        // Update in both database and file
        const dbSuccess = await updateDriverLocation(req.user.id, location);
        const fileSuccess = await updateDriverLocationInFile(req.user.id, location, status);
        
        // Emit socket update for real-time tracking
        if (fileSuccess) {
            const io = req.app.get('io');
            if (io) {
                const locationUpdate = {
                    driverId: req.user.id,
                    latitude,
                    longitude,
                    address,
                    status,
                    timestamp: new Date()
                };
                io.emit('driverLocationUpdate', locationUpdate);
                console.log('Emitted location update for driver:', encodeURIComponent(req.user.id));
            }
        }
        
        if (dbSuccess && fileSuccess) {
            res.json({ 
                success: true, 
                message: 'Location updated in database and file', 
                location,
                status 
            });
        } else {
            res.json({ 
                success: true, 
                message: 'Location partially updated', 
                location,
                dbUpdated: dbSuccess,
                fileUpdated: fileSuccess 
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.logout = async (req, res) => {
    try {
        if (req.sessionId) {
            SessionManager.invalidateSession(req.sessionId);
        }
        
        // Clear all auth cookies
        clearAllAuthCookies(res);
        
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getSessions = async (req, res) => {
    try {
        const sessions = SessionManager.getUserSessions(req.user.id);
        res.json({ success: true, sessions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.checkEmail = async (req, res) => {
    try {
        const { email } = req.body;
        const [existingUser, existingDriver, existingAdmin] = await Promise.all([
            User.findOne({ email }),
            Driver.findOne({ email }),
            Admin.findOne({ email })
        ]);
        
        if (existingUser || existingDriver || existingAdmin) {
            return res.json({ exists: true });
        }
        
        return res.status(404).json({ exists: false });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.setup2FA = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const secret = speakeasy.generateSecret({
            name: `CarRental (${user.email})`,
            issuer: 'Car Rental System'
        });
        
        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
        
        user.twoFactorSecret = secret.base32;
        await user.save();
        
        res.json({
            success: true,
            secret: secret.base32,
            qrCode: qrCodeUrl
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.verify2FA = async (req, res) => {
    try {
        const { token } = req.body;
        const user = await User.findById(req.user.id);
        
        if (!user || !user.twoFactorSecret) {
            return res.status(400).json({ success: false, error: '2FA not set up' });
        }
        
        const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token,
            window: 2
        });
        
        if (verified) {
            user.twoFactorEnabled = true;
            await user.save();
            
            res.json({ success: true, message: '2FA enabled successfully' });
        } else {
            res.status(400).json({ success: false, error: 'Invalid token' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.disable2FA = async (req, res) => {
    try {
        const { password } = req.body;
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(400).json({ success: false, error: 'Invalid password' });
        }
        
        user.twoFactorEnabled = false;
        user.twoFactorSecret = undefined;
        await user.save();
        
        res.json({ success: true, message: '2FA disabled successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};



exports.updateSettings = async (req, res) => {
    try {
        console.log('[SETTINGS] Update request:', {
            userId: encodeURIComponent(req.user.id),
            role: encodeURIComponent(req.user.role),
            keyCount: Object.keys(req.body).length
        });
        
        const Model = req.user.role === 'driver' ? Driver : User;
        
        const user = await Model.findById(req.user.id);
        console.log('[SETTINGS] User found:', {
            id: user?._id ? 'found' : 'not found'
        });
        
        if (!user) {
            console.log('[SETTINGS] User not found');
            return res.status(404).json({ success: false, error: `${req.user.role} not found` });
        }
        
        if (!user.settings) {
            user.settings = {};
            console.log('[SETTINGS] Initialized empty settings');
        }
        
        const oldSettings = JSON.parse(JSON.stringify(user.settings));
        
        // Allowlist of allowed settings to prevent mass assignment
        const allowedSettings = [
            'shareLocation', 'marketingEmails', 'showProfile', 'rideUpdates', 
            'promotionalOffers', 'emailNotifications', 'autoAcceptRides', 
            'rideNotifications', 'earningsReport', 'shareLocationWithPassengers'
        ];
        
        allowedSettings.forEach(key => {
            if (req.body[key] !== undefined) {
                user.settings[key] = req.body[key];
                console.log(`[SETTINGS] Set ${encodeURIComponent(key)} = ${encodeURIComponent(typeof req.body[key])}`);
            }
        });
        
        console.log('[SETTINGS] Settings before save - key count:', Object.keys(req.body).length);
        
        user.markModified('settings');
        const savedUser = await user.save({ validateBeforeSave: false });
        
        console.log('[SETTINGS] Settings saved successfully');
        
        res.json({ success: true, settings: savedUser.settings });
    } catch (err) {
        console.error('[SETTINGS] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getSettings = async (req, res) => {
    try {
        let user;
        if (req.user.role === 'driver') {
            user = await Driver.findById(req.user.id).select('settings');
        } else {
            user = await User.findById(req.user.id).select('settings');
        }
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Default settings if none exist
        const defaultSettings = {
            shareLocation: true,
            marketingEmails: false,
            showProfile: true,
            rideUpdates: true,
            promotionalOffers: false,
            emailNotifications: true,
            // Driver-specific defaults
            autoAcceptRides: false,
            rideNotifications: true,
            earningsReport: true,
            shareLocationWithPassengers: true
        };
        
        const settings = { ...defaultSettings, ...(user.settings || {}) };
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.applyDriver = async (req, res) => {
    try {
        // For testing - don't actually create the application
        console.log('Driver application submitted (test mode - not saved)');
        
        res.json({ 
            success: true, 
            message: 'Driver application submitted successfully (test mode)',
            status: null // Don't set any status for testing
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getDriverStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('driverApplication');
        
        console.log('Driver status check:', {
            userId: req.user.id,
            hasApplication: !!user.driverApplication,
            status: user.driverApplication?.status || 'none'
        });
        
        // Force clear any existing application data for testing
        if (user.driverApplication) {
            await User.findByIdAndUpdate(req.user.id, { $unset: { driverApplication: 1 } });
            console.log('Cleared driver application data for user:', req.user.id);
        }
        
        return res.json({ success: true, status: null });
    } catch (err) {
        console.error('Driver status error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};



exports.submitVerificationDocuments = async (req, res) => {
    try {
        const driverId = req.user.id;
        
        // Create verification request
        const verificationRequest = {
            status: 'pending',
            submittedAt: new Date()
        };
        
        const driverInfoDocuments = {};
        
        // Handle file uploads (simplified - in production, use proper file storage)
        if (req.files) {
            Object.keys(req.files).forEach(key => {
                const filename = req.files[key][0].filename;
                verificationRequest.documents[key] = filename;
                
                // Map to driverInfo.documents for admin portal compatibility
                if (key === 'license') {
                    driverInfoDocuments.licensePhoto = filename;
                } else if (key === 'registration') {
                    driverInfoDocuments.vehicleRC = filename;
                } else if (key === 'insurance') {
                    driverInfoDocuments.insurance = filename;
                } else if (key === 'photo') {
                    driverInfoDocuments.profilePhoto = filename;
                }
            });
        }
        
        // Update driver with verification request and driverInfo documents
        const updateData = {
            verificationRequest,
            'driverInfo.isVerified': false // Ensure they show up in verification requests
        };
        
        // Update driverInfo.documents if we have any documents
        if (Object.keys(driverInfoDocuments).length > 0) {
            Object.keys(driverInfoDocuments).forEach(key => {
                updateData[`driverInfo.documents.${key}`] = driverInfoDocuments[key];
            });
        }
        
        await Driver.findByIdAndUpdate(driverId, updateData);
        
        res.json({ 
            success: true, 
            message: 'Verification documents submitted successfully'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Account Management
exports.deactivateAccount = async (req, res) => {
    try {
        const { reason } = req.body;
        
        await User.findByIdAndUpdate(req.user.id, {
            'accountStatus.isActive': false,
            'accountStatus.deactivatedAt': new Date(),
            'accountStatus.deactivationReason': reason
        });
        
        // Clear all sessions
        SessionManager.invalidateAllUserSessions(req.user.id);
        clearAllAuthCookies(res);
        
        res.json({ success: true, message: 'Account deactivated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.reactivateAccount = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email });
        if (!user || user.accountStatus.isActive) {
            return res.status(400).json({ success: false, error: 'Invalid request' });
        }
        
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        
        await User.findByIdAndUpdate(user._id, {
            'accountStatus.isActive': true,
            'accountStatus.deactivatedAt': null,
            'accountStatus.deactivationReason': null
        });
        
        res.json({ success: true, message: 'Account reactivated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Device Management
exports.getDevices = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('devices');
        res.json({ success: true, devices: user.devices || [] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.removeDevice = async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        await User.findByIdAndUpdate(req.user.id, {
            $pull: { devices: { deviceId } }
        });
        
        // Invalidate sessions for this device
        SessionManager.invalidateDeviceSessions(req.user.id, deviceId);
        
        res.json({ success: true, message: 'Device removed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.trustDevice = async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        await User.findOneAndUpdate(
            { _id: req.user.id, 'devices.deviceId': deviceId },
            { $set: { 'devices.$.isTrusted': true } }
        );
        
        res.json({ success: true, message: 'Device marked as trusted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Login History
exports.getLoginHistory = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const user = await User.findById(req.user.id).select('loginHistory');
        
        const history = user.loginHistory
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice((page - 1) * limit, page * limit);
        
        res.json({ success: true, history, total: user.loginHistory.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// User Analytics
exports.getUserAnalytics = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('analytics profileCompletion verification badges');
        
        const analytics = {
            ...user.analytics,
            profileCompletion: user.profileCompletion,
            verification: user.verification,
            badges: user.badges || [],
            accountAge: Math.floor((Date.now() - user.createdAt) / (1000 * 60 * 60 * 24))
        };
        
        res.json({ success: true, analytics });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Verification
exports.requestVerification = async (req, res) => {
    try {
        const { type } = req.body; // email, phone, identity, address
        
        if (type === 'email') {
            // Send verification email
            const verificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            // Store code temporarily (in production, use Redis or similar)
            req.session.emailVerificationCode = verificationCode;
            
            await emailService.sendVerificationEmail(req.user.email, verificationCode);
            
            res.json({ success: true, message: 'Verification email sent' });
        } else if (type === 'phone') {
            // Send SMS verification (implement SMS service)
            res.json({ success: true, message: 'SMS verification not implemented yet' });
        } else {
            res.status(400).json({ success: false, error: 'Invalid verification type' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.verifyCode = async (req, res) => {
    try {
        const { type, code } = req.body;
        
        if (type === 'email' && req.session.emailVerificationCode === code) {
            await User.findByIdAndUpdate(req.user.id, {
                'verification.email': true
            });
            
            delete req.session.emailVerificationCode;
            res.json({ success: true, message: 'Email verified successfully' });
        } else {
            res.status(400).json({ success: false, error: 'Invalid verification code' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Preferences Management
exports.updatePreferences = async (req, res) => {
    try {
        const updates = {};
        // Limit iterations and validate keys to prevent DoS
        const keys = Object.keys(req.body).slice(0, 10);
        keys.forEach(key => {
            if (typeof key === 'string' && key.length < 50) {
                updates[`preferences.${key}`] = req.body[key];
            }
        });
        
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updates },
            { new: true }
        ).select('preferences');
        
        res.json({ success: true, preferences: user.preferences });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getPreferences = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('preferences');
        res.json({ success: true, preferences: user.preferences || {} });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Emergency Contacts
exports.addEmergencyContact = async (req, res) => {
    try {
        const { name, phone, relationship } = req.body;
        
        await User.findByIdAndUpdate(req.user.id, {
            $push: {
                'preferences.emergencyContacts': { name, phone, relationship }
            }
        });
        
        res.json({ success: true, message: 'Emergency contact added' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.removeEmergencyContact = async (req, res) => {
    try {
        const { contactId } = req.params;
        
        await User.findByIdAndUpdate(req.user.id, {
            $pull: {
                'preferences.emergencyContacts': { _id: contactId }
            }
        });
        
        res.json({ success: true, message: 'Emergency contact removed' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Account Security
exports.getSecurityOverview = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select(
            'twoFactorEnabled devices loginHistory accountStatus verification'
        );
        
        const recentLogins = user.loginHistory
            .filter(login => login.success)
            .slice(0, 5);
        
        const suspiciousActivity = user.loginHistory
            .filter(login => !login.success)
            .slice(0, 10);
        
        const security = {
            twoFactorEnabled: user.twoFactorEnabled,
            trustedDevices: user.devices.filter(d => d.isTrusted).length,
            totalDevices: user.devices.length,
            recentLogins,
            suspiciousActivity,
            verificationStatus: user.verification,
            accountLocked: user.accountStatus.lockedUntil > new Date()
        };
        
        res.json({ success: true, security });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Data Export (GDPR Compliance)
exports.exportUserData = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('-password -twoFactorSecret -twoFactorBackupCodes');
        
        // Include related data (rides, payments, etc.)
        const userData = {
            profile: user,
            exportedAt: new Date(),
            dataTypes: ['profile', 'settings', 'preferences', 'analytics', 'loginHistory']
        };
        
        res.json({ success: true, data: userData });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// User Insights
exports.getUserInsights = async (req, res) => {
    try {
        const UserManagementService = require('../services/userManagementService');
        const insights = await UserManagementService.generateUserInsights(req.user.id);
        
        if (!insights) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        res.json({ success: true, insights });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.deleteAccount = async (req, res) => {
    try {
        console.log('[DELETE_ACCOUNT] Request received:', { userId: req.user?.id, role: req.user?.role });
        const { password } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;
        
        // Get user/driver and verify password
        let user;
        if (userRole === 'driver') {
            user = await Driver.findById(userId);
        } else {
            user = await User.findById(userId);
        }
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }
        
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(400).json({ success: false, error: 'Invalid password' });
        }
        
        // Delete related data
        try {
            await Promise.all([
                Ride.deleteMany({ [userRole === 'driver' ? 'driver_id' : 'user_id']: userId }),

                SupportTicket.deleteMany({ userId })
            ]);
            

        } catch (relatedDataError) {
            console.error('Error deleting related data:', relatedDataError);
            // Continue with account deletion even if related data deletion fails
        }
        
        // Delete user/driver account
        if (userRole === 'driver') {
            await Driver.findByIdAndDelete(userId);
        } else {
            await User.findByIdAndDelete(userId);
        }
        
        // Clear all sessions
        try {
            const { SessionManager } = require('../middleware/sessionManager');
            SessionManager.invalidateAllUserSessions(userId);
            clearAllAuthCookies(res);
        } catch (sessionError) {
            console.error('Error clearing sessions:', sessionError);
            // Continue - account is already deleted
        }
        
        res.json({ success: true, message: 'Account deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get driver suspension status
exports.getDriverSuspensionStatus = async (req, res) => {
    try {
        if (req.user.role !== 'driver') {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }
        
        const driver = await Driver.findById(req.user.id).select('suspension status');
        if (!driver) {
            return res.status(404).json({ success: false, error: 'Driver not found' });
        }
        
        const suspensionData = driver.suspension || {};
        
        res.json({
            success: true,
            suspended: suspensionData.isSuspended || false,
            suspensionData: suspensionData.isSuspended ? {
                reason: suspensionData.reason,
                suspensionType: suspensionData.suspensionType,
                suspendedAt: suspensionData.suspendedAt,
                suspensionEndDate: suspensionData.suspensionEndDate,
                isPermanent: suspensionData.suspensionType === 'permanent'
            } : null
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};