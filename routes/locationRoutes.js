const express = require('express');
const locationController = require('../controllers/locationController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

const router = express.Router();

// Driver location update
router.put('/update', auth, role(['driver']), locationController.updateDriverLocation);

// Get driver status
router.get('/status', auth, role(['driver']), locationController.getDriverStatus);

// Get nearby drivers (for testing)
router.get('/nearby', auth, locationController.getNearbyDrivers);

module.exports = router;