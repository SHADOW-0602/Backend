const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Driver = require('../models/Driver');
const Admin = require('../models/Admin');

class SessionManager {
    // Active sessions store (in production, use Redis)
    static activeSessions = new Map();
    
    // Generate secure session token
    static generateSessionToken(userId, role, deviceInfo = {}) {
        const sessionId = `${userId}_${Date.now()}_${Math.random().toString(36)}`;
        const payload = {
            id: userId,
            role,
            sessionId,
            deviceInfo,
            iat: Math.floor(Date.now() / 1000)
        };
        
        const token = jwt.sign(payload, process.env.JWT_SECRET, { 
            expiresIn: process.env.JWT_EXPIRES_IN || '7d' 
        });
        
        // Store session info
        this.activeSessions.set(sessionId, {
            userId,
            role,
            deviceInfo,
            createdAt: new Date(),
            lastActivity: new Date(),
            isActive: true
        });
        
        return { token, sessionId };
    }
    
    // Validate and refresh session
    static async validateSession(token, req) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Verify user still exists and is active
            const userExists = await this.verifyUserExists(decoded.id, decoded.role);
            if (!userExists) {
                throw new Error('User account no longer exists');
            }
            
            return decoded;
        } catch (error) {
            throw new Error('Invalid session');
        }
    }
    
    // Verify user still exists in database
    static async verifyUserExists(userId, role) {
        try {
            let user;
            switch (role) {
                case 'admin':
                    user = await Admin.findById(userId).select('_id');
                    break;
                case 'driver':
                    user = await Driver.findById(userId).select('_id');
                    break;
                case 'user':
                    user = await User.findById(userId).select('_id');
                    break;
                default:
                    return false;
            }
            return !!user;
        } catch (error) {
            return false;
        }
    }
    
    // Invalidate specific session
    static invalidateSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.isActive = false;
            this.activeSessions.delete(sessionId);
        }
    }
    
    // Invalidate all sessions for a user
    static invalidateUserSessions(userId) {
        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (session.userId === userId) {
                this.invalidateSession(sessionId);
            }
        }
    }
    
    // Clean expired sessions
    static cleanExpiredSessions() {
        const now = new Date();
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        
        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (now - session.lastActivity > maxAge) {
                this.invalidateSession(sessionId);
            }
        }
    }
    
    // Get active sessions for user
    static getUserSessions(userId) {
        const userSessions = [];
        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (session.userId === userId && session.isActive) {
                userSessions.push({
                    sessionId,
                    deviceInfo: session.deviceInfo,
                    createdAt: session.createdAt,
                    lastActivity: session.lastActivity
                });
            }
        }
        return userSessions;
    }
}

// Middleware for session validation
exports.validateSession = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
        }
        
        const decoded = await SessionManager.validateSession(token, req);
        req.user = decoded;
        req.sessionId = decoded.sessionId;
        
        next();
    } catch (error) {
        res.status(401).json({ success: false, error: error.message });
    }
};

// Session cleanup interval (run every hour)
setInterval(() => {
    SessionManager.cleanExpiredSessions();
}, 60 * 60 * 1000);

module.exports = { SessionManager, validateSession: exports.validateSession };