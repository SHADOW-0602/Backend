const express = require('express');
const debugController = require('../controllers/debugController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

const router = express.Router();

// Debug specific ride status
router.get('/ride/:rideId/status', auth, role(['user', 'driver', 'admin']), debugController.debugRideStatus);

// Get ride status summary (admin only)
router.get('/rides/status-summary', auth, role(['admin']), debugController.getRideStatusSummary);

// Fix invalid ride data (admin only)
router.post('/rides/fix-invalid-data', auth, role(['admin']), debugController.fixInvalidRideData);

module.exports = router;