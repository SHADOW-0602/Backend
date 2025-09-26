const express = require('express');
const rideController = require('../controllers/rideController');
const auth =require('../middleware/auth');
const role = require('../middleware/role');
const { checkDriverSuspensionForRides } = require('../middleware/suspensionCheck');
const { validateRideStatus } = require('../middleware/validateRideStatus');

const router = express.Router();

// Request a ride (user)
router.post('/request', auth, role(['user']), rideController.requestRide);

// Find nearby drivers
router.get('/nearby-drivers', auth, role(['user']), rideController.findNearbyDrivers);

// Find drivers in zone
router.get('/zone-drivers', auth, role(['user']), rideController.findDriversInZone);

// Get upfront pricing with multiple vehicle options
router.post('/upfront-pricing', auth, role(['user']), rideController.getUpfrontPricing);

// Apply promo code to fare estimate
router.post('/apply-promo', auth, role(['user']), rideController.applyPromoCode);

// Estimate fare (legacy - redirects to upfront pricing)
router.post('/estimate-fare', auth, role(['user']), rideController.estimateFare);

// Calculate fare estimate (legacy)
router.post('/calculate-fare', auth, role(['user']), rideController.calculateFare);

// Get distance matrix
router.post('/distance-matrix', auth, role(['user', 'admin']), rideController.getDistanceMatrix);

// Trip tracking
router.post('/:rideId/start', auth, role(['driver']), checkDriverSuspensionForRides, rideController.startTrip);
router.put('/:rideId/start', auth, role(['driver']), checkDriverSuspensionForRides, rideController.startTrip);
router.get('/:rideId/status', auth, role(['user', 'driver']), rideController.getTripStatus);





// Cancel a ride
router.put('/:id/cancel', auth, role(['user', 'driver']), checkDriverSuspensionForRides, rideController.cancelRide);

// Update ride status (driver or admin)
router.put('/:id/status', auth, role(['driver', 'admin']), validateRideStatus, checkDriverSuspensionForRides, rideController.updateRideStatus);

// Get rides for user or driver
router.get('/mine', auth, role(['user', 'driver', 'admin']), rideController.getUserRides); // as user
router.get('/driver', auth, role(['driver']), checkDriverSuspensionForRides, rideController.getDriverRides);

// Get ride requests for drivers
router.get('/requests', auth, role(['driver']), checkDriverSuspensionForRides, rideController.getRideRequests);

// Accept a ride request
router.put('/:id/accept', auth, role(['driver']), checkDriverSuspensionForRides, rideController.acceptRideRequest);

// Decline a ride request
router.put('/:id/decline', auth, role(['driver']), rideController.declineRideRequest);

// Test endpoint to check if ride exists
router.get('/:id/test', auth, rideController.testRideExists);

// Debug endpoint for start ride
router.get('/:rideId/debug-start', auth, role(['driver']), async (req, res) => {
    try {
        const { rideId } = req.params;
        const Ride = require('../models/Ride');
        const ride = await Ride.findById(rideId);
        
        res.json({
            success: true,
            debug: {
                rideExists: !!ride,
                rideStatus: ride?.status,
                driverId: ride?.driver_id?.toString(),
                currentUserId: req.user.id,
                userRole: req.user.role,
                isAuthorized: ride?.driver_id?.toString() === req.user.id,
                canStart: ride?.status === 'accepted' || ride?.status === 'driver_arrived'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Debug endpoint for ride acceptance
router.get('/:id/debug', auth, (req, res) => {
    try {
        const rideId = req.params.id;
        console.log('Debug ride acceptance:', {
            rideId,
            rideIdLength: rideId?.length,
            rideIdType: typeof rideId,
            isValidObjectId: /^[0-9a-fA-F]{24}$/.test(rideId),
            userId: req.user.id,
            userRole: req.user.role,
            timestamp: new Date()
        });
        
        res.json({
            success: true,
            debug: {
                rideId,
                rideIdLength: rideId?.length,
                rideIdType: typeof rideId,
                isValidObjectId: /^[0-9a-fA-F]{24}$/.test(rideId),
                userId: req.user.id,
                userRole: req.user.role,
                timestamp: new Date()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Simple test endpoint without auth
router.get('/test-endpoint', (req, res) => {
    res.json({ success: true, message: 'Rides API is working', timestamp: new Date() });
});

// Get God's-eye view for admin monitoring
router.get('/god-view', auth, role(['admin']), rideController.getGodViewData);

// Get active trips for admin monitoring (legacy)
router.get('/active-trips', auth, role(['admin']), rideController.getActiveTrips);

// Rating and feedback endpoints
router.post('/:rideId/rate', auth, role(['user', 'driver']), rideController.submitRating);
router.post('/:rideId/rate-user', auth, role(['driver']), rideController.rateUser);
router.get('/:rideId/can-rate', auth, role(['user', 'driver']), rideController.canRate);
router.get('/rating-summary/:userId?', auth, role(['user', 'driver', 'admin']), rideController.getRatingSummary);

// Verify OTP and start ride (driver only)
router.post('/:rideId/verify-otp', auth, role(['driver']), checkDriverSuspensionForRides, rideController.verifyOTPAndStartRide);
router.post('/:rideId/verify-otp-start', auth, role(['driver']), checkDriverSuspensionForRides, rideController.verifyOTPAndStartRide);

// Regenerate OTP (driver only)
router.post('/:rideId/regenerate-otp', auth, role(['driver']), checkDriverSuspensionForRides, rideController.regenerateOTP);

// Complete ride with payment verification (driver only)
router.put('/:rideId/complete-with-payment', auth, role(['driver']), checkDriverSuspensionForRides, rideController.completeRideWithPayment);

// Complete ride (driver only) - Legacy
router.put('/:id/complete', auth, role(['driver']), checkDriverSuspensionForRides, rideController.completeRide);

module.exports = router;