const { SessionManager } = require('../middleware/sessionManager');
const { auditLog } = require('../middleware/rbac');

// Get security dashboard (admin only)
exports.getSecurityDashboard = async (req, res) => {
    try {
        const activeSessions = [];
        for (const [sessionId, session] of SessionManager.activeSessions.entries()) {
            activeSessions.push({
                sessionId,
                userId: session.userId,
                role: session.role,
                deviceInfo: session.deviceInfo,
                createdAt: session.createdAt,
                lastActivity: session.lastActivity,
                isActive: session.isActive
            });
        }

        res.json({
            success: true,
            dashboard: {
                totalActiveSessions: activeSessions.length,
                sessionsByRole: {
                    admin: activeSessions.filter(s => s.role === 'admin').length,
                    driver: activeSessions.filter(s => s.role === 'driver').length,
                    user: activeSessions.filter(s => s.role === 'user').length
                },
                activeSessions: activeSessions.slice(0, 20) // Limit to 20 for performance
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Force logout user (admin only)
exports.forceLogout = async (req, res) => {
    try {
        const { userId } = req.params;
        
        SessionManager.invalidateUserSessions(userId);
        
        console.log(`[SECURITY] Admin ${req.user.id} force logged out user ${userId}`);
        
        res.json({
            success: true,
            message: 'User sessions invalidated successfully'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get user activity log (admin only)
exports.getUserActivity = async (req, res) => {
    try {
        const { userId } = req.params;
        const sessions = SessionManager.getUserSessions(userId);
        
        res.json({
            success: true,
            userId,
            sessions
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Security health check
exports.securityHealthCheck = async (req, res) => {
    try {
        const checks = {
            jwtSecret: !!process.env.JWT_SECRET,
            encryptionKey: !!process.env.ENCRYPTION_KEY,
            mongoConnection: true, // Assume connected if we reach here
            activeSessions: SessionManager.activeSessions.size,
            timestamp: new Date()
        };

        const allHealthy = Object.values(checks).every(check => 
            typeof check === 'boolean' ? check : true
        );

        res.json({
            success: true,
            healthy: allHealthy,
            checks
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};