const express = require('express');
const notificationController = require('../controllers/notificationController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

const router = express.Router();

// Send notification to all or to one (admin only)
router.post('/send', auth, role(['admin']), notificationController.sendNotification);

module.exports = router;