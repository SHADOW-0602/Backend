const express = require('express');
const securityController = require('../controllers/securityController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

const router = express.Router();

// Security dashboard (admin only)
router.get('/dashboard', auth, role(['admin']), role.auditLog('security_dashboard_access', 'security'), securityController.getSecurityDashboard);

// Force logout user (admin only)
router.post('/force-logout/:userId', auth, role(['admin']), role.auditLog('force_logout', 'user_session'), securityController.forceLogout);

// Get user activity (admin only)
router.get('/user-activity/:userId', auth, role(['admin']), securityController.getUserActivity);

// Security health check
router.get('/health', securityController.securityHealthCheck);

module.exports = router;