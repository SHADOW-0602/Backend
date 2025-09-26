const express = require('express');
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { trackUserActivity, checkAccountLock, validateAccountStatus } = require('../middleware/userActivity');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Configure multer for verification documents
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/verification/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.fieldname}_${file.originalname}`);
    }
});

const upload = multer({ storage });
const uploadFields = upload.fields([
    { name: 'license', maxCount: 1 },
    { name: 'registration', maxCount: 1 },
    { name: 'insurance', maxCount: 1 },
    { name: 'photo', maxCount: 1 }
]);

// User registration and login
router.post('/register', userController.register);
router.post('/login', checkAccountLock, userController.login);

// Token validation for socket connections
router.get('/validate-token', auth, (req, res) => {
  res.json({ valid: true, user: { id: req.user.id, name: req.user.name } });
});

// Cleanup invalid session
router.post('/cleanup-session', (req, res) => {
  res.clearCookie('auth_user');
  res.clearCookie('auth_driver');
  res.clearCookie('auth_admin');
  res.json({ success: true, message: 'Session cleared' });
});

// Protected: Profile info and update (with activity tracking)
router.get('/profile', auth, validateAccountStatus, trackUserActivity, userController.getProfile);
router.put('/profile', auth, validateAccountStatus, trackUserActivity, userController.updateProfile);
router.put('/change-password', auth, validateAccountStatus, userController.changePassword);

// Driver location update
router.put('/location', auth, role(['driver']), userController.updateLocation);

// Session management
router.post('/logout', auth, userController.logout);
router.get('/sessions', auth, userController.getSessions);

// Email check for new users
router.post('/check-email', userController.checkEmail);

// 2FA routes
router.post('/2fa/setup', auth, userController.setup2FA);
router.post('/2fa/verify', auth, userController.verify2FA);
router.post('/2fa/disable', auth, userController.disable2FA);



// Settings routes
router.get('/settings', auth, userController.getSettings);
router.put('/settings', auth, userController.updateSettings);



// Driver application routes
router.post('/apply-driver', auth, userController.applyDriver);
router.get('/driver-status', auth, userController.getDriverStatus);



// Driver verification documents
router.post('/submit-verification', auth, role(['driver']), uploadFields, userController.submitVerificationDocuments);

// Account Management
router.post('/deactivate', auth, userController.deactivateAccount);
router.post('/reactivate', userController.reactivateAccount);

// Device Management
router.get('/devices', auth, userController.getDevices);
router.delete('/devices/:deviceId', auth, userController.removeDevice);
router.put('/devices/:deviceId/trust', auth, userController.trustDevice);

// Login History & Security
router.get('/login-history', auth, userController.getLoginHistory);
router.get('/security-overview', auth, userController.getSecurityOverview);

// User Analytics
router.get('/analytics', auth, userController.getUserAnalytics);

// Verification System
router.post('/request-verification', auth, userController.requestVerification);
router.post('/verify-code', auth, userController.verifyCode);

// Preferences Management
router.get('/preferences', auth, userController.getPreferences);
router.put('/preferences', auth, userController.updatePreferences);

// Emergency Contacts
router.post('/emergency-contacts', auth, userController.addEmergencyContact);
router.delete('/emergency-contacts/:contactId', auth, userController.removeEmergencyContact);

// Data Export (GDPR)
router.get('/export-data', auth, userController.exportUserData);

// User Insights
router.get('/insights', auth, userController.getUserInsights);

// Support messages for users
router.get('/support/messages', auth, async (req, res) => {
  try {
    const ContactMessage = require('../models/ContactMessage');
    const messages = await ContactMessage.find({ 
      $or: [
        { userId: req.user.id },
        { email: req.user.email }
      ]
    }).sort({ createdAt: -1 });
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit support message for users
router.post('/support/contact', auth, async (req, res) => {
  try {
    const ContactMessage = require('../models/ContactMessage');
    const { subject, message } = req.body;
    const contactMessage = new ContactMessage({ 
      name: req.user.name,
      email: req.user.email,
      subject, 
      message, 
      userId: req.user.id,
      userType: 'user'
    });
    await contactMessage.save();
    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Driver suspension status
router.get('/suspension-status', auth, userController.getDriverSuspensionStatus);

// Account deletion
router.delete('/delete-account', auth, userController.deleteAccount);
router.post('/delete-account', auth, userController.deleteAccount);

// Test route for debugging
router.get('/test-delete', auth, (req, res) => {
    res.json({ success: true, message: 'Delete route is accessible', user: req.user });
});

module.exports = router;
