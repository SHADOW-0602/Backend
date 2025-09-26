const express = require('express');
const adminSetupController = require('../controllers/adminSetupController');

const router = express.Router();

// Check if initial setup is required
router.get('/check', adminSetupController.checkSetupRequired);

// Create initial admin (only if no admin exists)
router.post('/admin', adminSetupController.createAdmin);

// Emergency admin reset (requires special token)
router.post('/reset-admin', adminSetupController.resetAdmin);

module.exports = router;