const path = require('path');
const Ride = require('../models/Ride');
const Driver = require('../models/Driver');
const User = require('../models/User');
const { calculateDistance } = require('../utils/haversine');
const { parseLocationFile, findNearbyDrivers, findDriversInZone, getDistanceMatrix } = require('../services/locationService');
const InvoiceService = require('../services/invoiceService');
const FareEstimationService = require('../services/trip-planning/fareEstimationService');
const DriverMatchingService = require('../services/matching/driverMatchingService');
const TripTrackingService = require('../services/trip-execution/tripTrackingService');
const RatingFeedbackService = require('../services/post-trip/ratingFeedbackService');
const { generateOTPWithExpiry, verifyOTP, isOTPExpired } = require('../utils/otpGenerator');

const invoiceService = new InvoiceService();
const fareEstimationService = new FareEstimationService();
const driverMatchingService = new DriverMatchingService();
const ratingFeedbackService = new RatingFeedbackService();

// Trip tracking service will be initialized with socket.io instance
let tripTrackingService = null;

// Helper function to get driver's current location
async function getDriverCurrentLocation(driverId) {
    try {
        // Get driver location from database instead of file
        const driver = await Driver.findById(driverId).select('location');
        if (driver && driver.location) {
            return {
                latitude: driver.location.latitude,
                longitude: driver.location.longitude,
                address: driver.location.address
            };
        }
        return null;
    } catch (error) {
        console.error('Error getting driver location:', error);
        return null;
    }
}

exports.requestRide = async (req, res) => {
    try {
        console.log('=== RIDE REQUEST START ===');
        const { pickup_location, drop_location, vehicle_type, payment_method, preferred_driver_id, promo_code } = req.body;
        console.log('Request data:', { pickup_location, drop_location, vehicle_type, payment_method });
        
        // Check for existing active ride
        const existingRide = await Ride.findOne({
            user_id: req.user.id,
            status: { $in: ['requested', 'searching', 'accepted', 'in_progress'] }
        }).populate('driver_id', 'name phone rating');
        
        if (existingRide) {
            return res.json({
                success: true,
                hasActiveRide: true,
                ride: existingRide,
                message: 'You have an active ride. Complete it before booking another.'
            });
        }
        
        // Validate required fields
        if (!pickup_location || !drop_location || !vehicle_type || !payment_method) {
            return res.status(400).json({ 
                success: false,
                error: 'Pickup location, drop location, vehicle type, and payment method are required'
            });
        }
        
        // Get upfront pricing
        const pricingData = await fareEstimationService.getUpfrontPricing(
            pickup_location, 
            drop_location, 
            [vehicle_type]
        );
        
        if (!pricingData.vehicleOptions || pricingData.vehicleOptions.length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Unable to calculate fare for selected vehicle type'
            });
        }
        
        let fareDetails = pricingData.vehicleOptions[0];
        
        // Apply promo code if provided
        if (promo_code) {
            fareDetails = await fareEstimationService.applyPromoCode(fareDetails, promo_code);
        }
        
        // Create ride request with 'searching' status
        const rideData = {
            user_id: req.user.id,
            pickup_location,
            drop_location,
            distance: pricingData.tripDetails.distance,
            fare: fareDetails.promoApplied ? fareDetails.promoApplied.finalFare : fareDetails.totalFare,
            estimatedFare: fareDetails.totalFare,
            vehicle_type,
            payment_method,
            status: 'searching',
            estimatedTime: pricingData.tripDetails.estimatedTime,
            fareBreakdown: fareDetails.fareBreakdown,
            surgeMultiplier: fareDetails.surgeMultiplier,
            promoApplied: fareDetails.promoApplied || null,
            ride_phases: {
                searching_started: new Date()
            },
            search_timeout: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes timeout
        };
        
        if (preferred_driver_id) {
            rideData.preferred_driver_id = preferred_driver_id;
        }
        
        const ride = await Ride.create(rideData);
        console.log(`✅ Ride created with status: ${ride.status}`);

        // Use advanced driver matching
        const io = req.app.get('io');
        if (io) {
            // Initialize trip tracking service if not already done
            if (!tripTrackingService) {
                tripTrackingService = new TripTrackingService(io);
                // Store reference in app for other controllers
                req.app.set('tripTrackingService', tripTrackingService);
            }
            
            // Broadcast to optimal drivers
            console.log(`📡 Broadcasting ride ${ride._id} to ${vehicle_type} drivers`);
            const matchingResult = await driverMatchingService.broadcastRideRequest(
                ride._id, 
                vehicle_type, 
                pickup_location, 
                drop_location, 
                fareDetails.totalFare, 
                io
            );
            console.log(`📡 Broadcast result: ${matchingResult.driversNotified} drivers notified`);
            
            // Notify admin
            io.emit('admin_notification', {
                type: 'new_ride_request',
                rideId: ride._id,
                message: `New ${vehicle_type} ride request from ${req.user.name}`,
                user: req.user.name,
                pickup: pickup_location.address,
                destination: drop_location.address,
                estimatedFare: fareDetails.totalFare,
                driversNotified: matchingResult.driversNotified,
                timestamp: new Date()
            });
        }

        console.log('=== RIDE REQUEST COMPLETE ===');
        res.json({ 
            success: true,
            hasActiveRide: false,
            ride,
            pricingDetails: pricingData,
            finalFare: fareDetails.promoApplied ? fareDetails.promoApplied.finalFare : fareDetails.totalFare,
            message: `Searching for available ${vehicle_type} drivers nearby...`,
            searchTimeout: 300, // 5 minutes
            requiresDriverAcceptance: true,
            status: 'searching' // Explicitly show searching status
        });
    } catch (err) {
        console.error('❌ RIDE REQUEST ERROR:', err);
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.findNearbyDrivers = async (req, res) => {
    try {
        const { latitude, longitude, vehicle_type, radius = 5 } = req.query;
        const pickup_location = { latitude: parseFloat(latitude), longitude: parseFloat(longitude) };
        
        const nearbyDrivers = await findNearbyDrivers(pickup_location, vehicle_type, radius);
        
        // Add ETA and enhanced info for each driver
        const enhancedDrivers = nearbyDrivers.map(driver => ({
            ...driver.toObject(),
            eta: Math.ceil(driver.distance * 2), // 2 minutes per km
            vehicle_info: {
                type: vehicle_type,
                model: `${vehicle_type.charAt(0).toUpperCase() + vehicle_type.slice(1)} Car`
            },
            availability: 'available'
        }));
        
        res.json({
            success: true,
            drivers: enhancedDrivers,
            count: enhancedDrivers.length
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.updateRideStatus = async (req, res) => {
    try {
        const { status, location } = req.body;
        const updateData = { status };
        
        if (status === 'completed') {
            updateData['timestamps.completed_at'] = new Date();
            // Tracking is now handled via socket.io
        }
        
        if (status === 'in_progress' && !updateData['timestamps.started_at']) {
            updateData['timestamps.started_at'] = new Date();
        }
        
        const ride = await Ride.findByIdAndUpdate(req.params.id, updateData, { new: true })
            .populate('user_id', 'name phone')
            .populate('driver_id', 'name phone rating');
        
        // Auto-generate invoice when ride is completed
        if (status === 'completed') {
            try {
                await invoiceService.generateInvoice(req.params.id);
            } catch (invoiceError) {
                console.error('Invoice generation failed for ride:', encodeURIComponent(req.params.id), 'Error:', invoiceError.message);
            }
            
            // Notify user that ride is completed and payment is required
            const io = req.app.get('io');
            if (io) {
                io.emit(`user_notification_${ride.user_id._id}`, {
                    type: 'ride_completed',
                    rideId: req.params.id,
                    message: 'Your ride has been completed. Please proceed with payment.',
                    paymentMethod: ride.payment_method,
                    fare: ride.fare,
                    timestamp: new Date()
                });
            }
        }
            
        res.json({ success: true, ride });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// This duplicate function is removed - see the correct one below



exports.cancelRide = async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.id)
            .populate('user_id', 'name phone')
            .populate('driver_id', 'name phone');
        
        if (!ride) {
            return res.status(404).json({ success: false, error: 'Ride not found' });
        }
        
        if (ride.status === 'completed' || ride.status === 'cancelled') {
            return res.status(400).json({ success: false, error: 'Cannot cancel this ride' });
        }
        
        // Check authorization
        if (req.user.role === 'user' && ride.user_id._id.toString() !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        if (req.user.role === 'driver' && ride.driver_id && ride.driver_id._id.toString() !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        ride.status = 'cancelled';
        ride.timestamps.cancelled_at = new Date();
        await ride.save();
        
        // Tracking is now handled via socket.io
        
        // Clear location update interval
        if (global.locationIntervals && global.locationIntervals[req.params.id]) {
            clearInterval(global.locationIntervals[req.params.id]);
            delete global.locationIntervals[req.params.id];
        }
        
        // Send notifications
        const io = req.app.get('io');
        if (io) {
            if (req.user.role === 'user' && ride.driver_id) {
                // Notify driver that user cancelled
                io.emit(`driver_notification_${ride.driver_id._id}`, {
                    type: 'ride_cancelled',
                    rideId: req.params.id,
                    message: `Ride cancelled by ${ride.user_id.name}`,
                    timestamp: new Date()
                });
            } else if (req.user.role === 'driver' && ride.user_id) {
                // Notify user that driver cancelled
                io.emit(`user_notification_${ride.user_id._id}`, {
                    type: 'ride_cancelled',
                    rideId: req.params.id,
                    message: `Ride cancelled by driver ${ride.driver_id ? ride.driver_id.name : 'Driver'}`,
                    timestamp: new Date()
                });
            }
        }
        
        res.json({ success: true, message: 'Ride cancelled successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.findDriversInZone = async (req, res) => {
    try {
        const { latitude, longitude } = req.query;
        const pickup_location = { latitude: parseFloat(latitude), longitude: parseFloat(longitude) };
        
        const zoneData = await findDriversInZone(pickup_location);
        
        res.json({
            success: true,
            zone: zoneData.zone,
            drivers: zoneData.drivers,
            count: zoneData.count
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getDistanceMatrix = async (req, res) => {
    try {
        const { origins, destinations } = req.body;
        
        const matrix = await getDistanceMatrix(origins, destinations);
        
        res.json({
            success: true,
            matrix,
            origins_count: origins.length,
            destinations_count: destinations.length
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.calculateFare = async (req, res) => {
    try {
        const { pickup_location, drop_location, vehicle_type } = req.body;
        
        const distance = calculateDistance(
            pickup_location.latitude, pickup_location.longitude,
            drop_location.latitude, drop_location.longitude
        );
        
        // Vehicle type rates (consistent with main calculation)
        const vehicleRates = {
            bike: { baseFare: 20, perKm: 8, perMin: 1.5 },
            sedan: { baseFare: 50, perKm: 15, perMin: 2.5 },
            suv: { baseFare: 80, perKm: 25, perMin: 3 }
        };
        
        const rates = vehicleRates[vehicle_type] || vehicleRates.sedan;
        const fare = rates.baseFare + (distance * rates.perKm);
        
        res.json({
            success: true,
            distance: Math.round(distance * 100) / 100,
            estimatedFare: Math.round(fare),
            baseFare: rates.baseFare,
            perKmRate: rates.perKm,
            estimatedTime: Math.ceil(distance * 3) // 3 minutes per km
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.startTrip = async (req, res) => {
    try {
        const { rideId } = req.params;
        console.log('Starting trip for ride:', rideId);
        
        const ride = await Ride.findById(rideId);
        if (!ride) {
            console.log('Ride not found:', rideId);
            return res.status(404).json({ success: false, error: 'Ride not found' });
        }
        
        console.log('Current ride status:', ride.status);
        console.log('Driver ID from ride:', ride.driver_id);
        console.log('Current user ID:', req.user.id);
        
        // Check if driver is authorized
        if (ride.driver_id && ride.driver_id.toString() !== req.user.id) {
            console.log('Unauthorized driver attempting to start ride');
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        if (ride.status !== 'accepted' && ride.status !== 'driver_arrived') {
            console.log('Invalid ride status for starting trip:', ride.status);
            return res.status(400).json({ 
                success: false, 
                error: `Ride must be accepted or driver arrived to start trip. Current status: ${ride.status}` 
            });
        }
        
        // Update ride status to in_progress
        ride.status = 'in_progress';
        ride.timestamps = ride.timestamps || {};
        ride.timestamps.started_at = new Date();
        await ride.save();
        
        console.log('Ride status updated to in_progress');
        
        // Use trip tracking service to start trip
        if (tripTrackingService) {
            await tripTrackingService.startTripTracking(rideId);
            console.log('Trip tracking started');
        }
        
        const updatedRide = await Ride.findById(rideId)
            .populate('user_id driver_id', 'name phone');
        
        // Notify user that ride has started
        const io = req.app.get('io');
        if (io && ride.user_id) {
            io.emit(`user_notification_${ride.user_id}`, {
                type: 'ride_started',
                rideId: rideId,
                message: 'Your ride has started. Driver is on the way to your destination.',
                timestamp: new Date()
            });
        }
        
        console.log('Trip started successfully for ride:', rideId);
        res.json({
            success: true,
            message: 'Trip started successfully',
            ride: updatedRide,
            trackingEnabled: true,
            nextStep: 'Navigate to destination and complete trip'
        });
    } catch (err) {
        console.error('Start trip error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getTripStatus = async (req, res) => {
    try {
        const { rideId } = req.params;
        
        const ride = await Ride.findById(rideId)
            .populate('user_id', 'name phone')
            .populate('driver_id', 'name phone rating');
            
        if (!ride) {
            return res.status(404).json({ success: false, error: 'Ride not found' });
        }
        
        // Check authorization - admin can access all rides, users can access their own, drivers can access assigned rides
        const isAuthorized = 
            req.user.role === 'admin' ||
            (req.user.role === 'user' && ride.user_id && ride.user_id._id.toString() === req.user.id) ||
            (req.user.role === 'driver' && ride.driver_id && ride.driver_id._id.toString() === req.user.id);
            
        if (!isAuthorized) {
            console.log('Authorization failed:', {
                userRole: req.user.role,
                userId: req.user.id,
                rideUserId: ride.user_id?._id?.toString(),
                rideDriverId: ride.driver_id?._id?.toString()
            });
            return res.status(403).json({ success: false, error: 'Unauthorized access to this ride' });
        }
        
        // Provide driver location data for tracking
        let driverLocation = null;
        let trackingData = null;
        if (ride.status === 'in_progress' && ride.driver_id) {
            // Tracking data is now provided via socket.io real-time updates
            // Check if ride has tracking data in database
            if (ride.tracking) {
                if (req.user.role === 'driver') {
                    trackingData = ride.tracking;
                } else if (req.user.role === 'user') {
                    driverLocation = {
                        address: ride.tracking.currentLocation?.address || 'En route',
                        progress: ride.tracking.progress || 0,
                        eta: ride.tracking.eta || 'Calculating...'
                    };
                }
            }
        }
        
        // Check rating status if ride is completed
        let ratingStatus = null;
        if (ride.status === 'completed') {
            const canRate = await ratingService.canRate(rideId, req.user.id);
            ratingStatus = {
                canRate: canRate.canRate,
                reason: canRate.reason || null
            };
        }
        
        res.json({
            success: true,
            ride: {
                ...ride.toObject(),
                // Ensure driver_info is included in response
                driver_info: ride.driver_info || null,
                // Include populated driver data if available
                driver_id: ride.driver_id || null
            },
            tracking: trackingData,
            driverLocation,
            isTracking: ride.status === 'in_progress' && req.user.role === 'driver',
            ratingStatus
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getRideRequests = async (req, res) => {
    try {
        console.log('Getting ride requests for driver:', req.user.id);
        
        // Get driver info to filter by vehicle type
        const driver = await Driver.findById(req.user.id).select('driverInfo.vehicleType name');
        if (!driver) {
            return res.status(404).json({ success: false, error: 'Driver not found' });
        }
        
        console.log('Driver vehicle type:', driver.driverInfo?.vehicleType);
        
        if (!driver.driverInfo?.vehicleType) {
            console.log('Driver has no vehicle type set');
            return res.json({ success: true, requests: [], message: 'Vehicle type not set in driver profile' });
        }
        
        // First, let's see all searching rides
        const allSearchingRides = await Ride.find({ status: 'searching' })
            .select('_id vehicle_type status driver_id declined_by')
            .sort({ createdAt: -1 });
        
        console.log('All searching rides:', allSearchingRides.length);
        allSearchingRides.forEach(ride => {
            console.log(`Ride ${ride._id}: vehicle_type=${ride.vehicle_type}, status=${ride.status}, driver_id=${ride.driver_id}`);
        });
        
        const requests = await Ride.find({ 
            status: 'searching',
            vehicle_type: driver.driverInfo.vehicleType,
            $or: [
                { driver_id: { $exists: false } },
                { driver_id: null }
            ],
            declined_by: { $nin: [req.user.id] }
        })
        .populate('user_id', 'name phone rating')
        .sort({ createdAt: -1 })
        .limit(20);
        
        console.log(`Found ${requests.length} ride requests for vehicle type: ${driver.driverInfo.vehicleType}`);
        requests.forEach(request => {
            console.log(`Request ID: ${request._id}, Status: ${request.status}, Vehicle: ${request.vehicle_type}`);
        });
        
        res.json({ success: true, requests });
    } catch (err) {
        console.error('Get ride requests error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.acceptRideRequest = async (req, res) => {
    try {
        const rideId = req.params.id;
        const driverId = req.user.id;
        
        console.log('Driver accepting ride:', rideId);
        
        // Use advanced matching service to handle acceptance
        const result = await driverMatchingService.handleDriverResponse(rideId, driverId, 'accept');
        
        if (!result.success) {
            return res.status(400).json({ 
                success: false, 
                error: result.reason 
            });
        }
        
        // Get updated ride with driver info
        const ride = await Ride.findById(rideId)
            .populate('user_id', 'name phone')
            .populate('driver_id', 'name phone rating driverInfo');
        
        // Generate OTP for ride verification
        const otpData = generateOTPWithExpiry(10);
        
        // Get driver location and calculate ETA
        const driverLocation = await getDriverCurrentLocation(driverId);
        const distanceFromUser = driverLocation ? 
            calculateDistance(
                driverLocation.latitude, driverLocation.longitude,
                ride.pickup_location.latitude, ride.pickup_location.longitude
            ) : 2;
        
        const eta = Math.ceil((distanceFromUser / 30) * 60);
        
        // Update ride with driver details and OTP
        ride.otp = otpData;
        
        // Debug driver info
        console.log('Driver info for vehicle number:', {
            driverInfo: ride.driver_id.driverInfo,
            registrationNumber: ride.driver_id.driverInfo?.registrationNumber
        });
        
        ride.driver_info = {
            name: ride.driver_id.name,
            phone: ride.driver_id.phone,
            vehicle_number: ride.driver_id.driverInfo?.registrationNumber || 'Not specified',
            vehicle_model: ride.driver_id.driverInfo?.vehicleModel || ride.vehicle_type,
            rating: ride.driver_id.rating || 4.5,
            distance_from_user: Math.round(distanceFromUser * 100) / 100,
            eta: eta,
            photo: ride.driver_id.profilePhoto || null
        };
        
        await ride.save();
        
        // Update driver status to busy
        await Driver.findByIdAndUpdate(driverId, { status: 'busy' });
        
        // Start trip tracking
        const io = req.app.get('io');
        if (io && tripTrackingService && driverLocation) {
            await tripTrackingService.startDriverTracking(
                rideId,
                driverLocation,
                ride.pickup_location
            );
        }
        
        // Send notifications
        if (io) {
            // Notify user
            io.emit(`user_notification_${ride.user_id._id}`, {
                type: 'ride_accepted',
                rideId,
                message: `${ride.driver_id.name} is coming to pick you up`,
                driver: ride.driver_info,
                otp: otpData.code,
                eta: `${eta} min`,
                timestamp: new Date()
            });
            
            // Notify other drivers
            io.emit('ride_no_longer_available', {
                rideId,
                message: 'This ride has been accepted by another driver',
                timestamp: new Date()
            });
            
            // Notify admin
            io.emit('admin_notification', {
                type: 'ride_accepted',
                rideId,
                message: `Ride accepted by ${ride.driver_id.name}`,
                user: ride.user_id.name,
                driver: ride.driver_id.name,
                eta,
                timestamp: new Date()
            });
        }
        
        res.json({ 
            success: true, 
            ride, 
            message: 'Ride accepted successfully',
            nextStep: 'Navigate to pickup location and verify OTP with passenger'
        });
    } catch (err) {
        console.error('Accept ride error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get God's-eye view for admin monitoring
exports.getGodViewData = async (req, res) => {
    try {
        let godViewData = { totalActiveRides: 0, rides: [], timestamp: new Date() };
        
        if (tripTrackingService) {
            godViewData = await tripTrackingService.getGodViewData();
        }
        
        res.json({ 
            success: true, 
            ...godViewData,
            trackingServiceActive: !!tripTrackingService
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Legacy endpoint for backward compatibility
exports.getActiveTrips = exports.getGodViewData;

// Verify OTP and start ride (driver only)
exports.verifyOTPAndStartRide = async (req, res) => {
    try {
        const { rideId } = req.params;
        const { otp } = req.body;
        const driverId = req.user.id;
        
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ success: false, error: 'Ride not found' });
        }
        
        if (ride.driver_id.toString() !== driverId) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        if (ride.status !== 'accepted') {
            return res.status(400).json({ success: false, error: 'Ride must be accepted to start' });
        }
        
        // Verify OTP
        if (!verifyOTP(otp, ride.otp.code, ride.otp.expires_at)) {
            if (isOTPExpired(ride.otp.expires_at)) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'OTP has expired. Please request a new ride.' 
                });
            }
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid OTP. Please check with the passenger.' 
            });
        }
        
        // Start the ride
        ride.status = 'in_progress';
        ride.timestamps.started_at = new Date();
        await ride.save();
        
        // Tracking is now handled via socket.io
        
        // Notify user that ride has started
        const io = req.app.get('io');
        if (io) {
            io.emit(`user_notification_${ride.user_id}`, {
                type: 'ride_started',
                rideId: rideId,
                message: 'Your ride has started. Driver is on the way to your destination.',
                timestamp: new Date()
            });
        }
        
        res.json({
            success: true,
            message: 'Ride started successfully',
            ride
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Complete ride with payment verification (driver only)
exports.completeRideWithPayment = async (req, res) => {
    try {
        const { rideId } = req.params;
        const { paymentReceived } = req.body;
        const driverId = req.user.id;
        
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ success: false, error: 'Ride not found' });
        }
        
        if (ride.driver_id.toString() !== driverId) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        if (ride.status !== 'in_progress') {
            return res.status(400).json({ success: false, error: 'Ride must be in progress to complete' });
        }
        
        // Check if payment is received
        if (!paymentReceived) {
            return res.status(400).json({ 
                success: false, 
                error: 'Payment must be received before ending the ride' 
            });
        }
        
        ride.status = 'completed';
        ride.payment_status = 'paid';
        ride.timestamps.completed_at = new Date();
        await ride.save();
        
        // Set driver back to available
        await Driver.findByIdAndUpdate(driverId, { status: 'available' });
        
        // Tracking is now handled via socket.io
        
        // Clear location update interval
        if (global.locationIntervals && global.locationIntervals[rideId]) {
            clearInterval(global.locationIntervals[rideId]);
            delete global.locationIntervals[rideId];
        }
        
        // Auto-generate invoice
        try {
            await invoiceService.generateInvoice(rideId);
        } catch (invoiceError) {
            console.error('Invoice generation failed for ride:', rideId, 'Error:', invoiceError.message);
        }
        
        const populatedRide = await Ride.findById(rideId)
            .populate('user_id', 'name phone')
            .populate('driver_id', 'name phone rating');
        
        // Notify user that ride is completed
        const io = req.app.get('io');
        if (io) {
            io.emit(`user_notification_${ride.user_id}`, {
                type: 'ride_completed',
                rideId: rideId,
                message: 'Your ride has been completed. Thank you for choosing our service!',
                ride: populatedRide,
                timestamp: new Date()
            });
        }
        
        res.json({
            success: true,
            message: 'Ride completed successfully',
            ride: populatedRide
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Complete ride (driver only) - Legacy function for backward compatibility
exports.completeRide = async (req, res) => {
    try {
        const rideId = req.params.id;
        const driverId = req.user.id;
        
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ success: false, error: 'Ride not found' });
        }
        
        if (ride.driver_id.toString() !== driverId) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        if (ride.status !== 'in_progress') {
            return res.status(400).json({ success: false, error: 'Ride must be in progress to complete' });
        }
        
        // Update ride status to completed
        ride.status = 'completed';
        ride.timestamps = ride.timestamps || {};
        ride.timestamps.completed_at = new Date();
        await ride.save();
        
        // Use trip tracking service to complete trip
        if (tripTrackingService) {
            await tripTrackingService.completeTrip(rideId);
        }
        
        // Set driver back to available, increment completed rides, and update earnings
        await Driver.findByIdAndUpdate(driverId, { 
            status: 'available',
            $inc: { 
                completedRides: 1,
                'earnings.total': ride.fare || 0
            }
        });
        
        // Auto-generate invoice
        try {
            await invoiceService.generateInvoice(rideId);
        } catch (invoiceError) {
            console.error('Invoice generation failed for ride:', rideId, 'Error:', invoiceError.message);
        }
        
        const completedRide = await Ride.findById(rideId)
            .populate('user_id', 'name phone')
            .populate('driver_id', 'name phone rating');
        
        // Notify user that ride is completed
        const io = req.app.get('io');
        if (io && ride.user_id) {
            io.emit(`user_notification_${ride.user_id}`, {
                type: 'ride_completed',
                rideId: rideId,
                message: 'Your ride has been completed. Thank you for choosing our service!',
                ride: completedRide,
                timestamp: new Date()
            });
        }
        
        res.json({ 
            success: true, 
            ride: completedRide, 
            message: 'Ride completed successfully',
            nextStep: 'Both parties can now rate each other'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get user's rides (includes ALL statuses including 'requested')
exports.getUserRides = async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'admin') {
            // Admin can see all rides
            query = {};
        } else if (req.user.role === 'driver') {
            // Driver can see their assigned rides
            query = { driver_id: req.user.id };
        } else {
            // Regular user can see their own rides
            query = { user_id: req.user.id };
        }
        
        const rides = await Ride.find(query)
            .populate('driver_id', 'name phone rating')
            .populate('user_id', 'name phone')
            .sort({ createdAt: -1 });
        
        res.json({ success: true, rides });
    } catch (err) {
        console.error('Get user rides error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get driver's rides
exports.getDriverRides = async (req, res) => {
    try {
        const rides = await Ride.find({ driver_id: req.user.id })
            .populate('user_id', 'name phone rating')
            .sort({ createdAt: -1 });
        
        console.log(`Found ${rides.length} rides for driver ${req.user.id}`);
        rides.forEach(ride => {
            console.log(`  - Ride ${ride._id}: status=${ride.status}`);
        });
        
        res.json({ success: true, rides });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Find nearby drivers with strict vehicle type matching
async function findNearbyDriversWithMatching(pickupLocation, vehicleType, userId) {
    try {
        console.log('=== FINDING NEARBY DRIVERS ===');
        console.log('Pickup location:', pickupLocation);
        console.log('Vehicle type requested:', vehicleType);
        
        // Get only drivers with exact vehicle type match
        const availableDrivers = await Driver.find({
            status: 'available',
            'driverInfo.isVerified': true,
            location: { $exists: true },
            'driverInfo.vehicleType': vehicleType
        }).select('name phone rating location lastActive driverInfo');
        
        console.log(`Found ${availableDrivers.length} available drivers for ${vehicleType}`);
        
        if (availableDrivers.length === 0) {
            return [];
        }
        
        // Calculate scores for each driver with strict vehicle type filtering
        const driversWithScores = availableDrivers.map(driver => {
            // Vehicle type already filtered in query
            
            const distance = calculateDistance(
                pickupLocation.latitude,
                pickupLocation.longitude,
                driver.location.latitude,
                driver.location.longitude
            );
            
            // Calculate matching score based on multiple factors
            let score = 0;
            
            // Distance score (closer is better)
            const maxDistance = 10; // 10km max
            const distanceScore = Math.max(0, (maxDistance - distance) / maxDistance) * 40;
            score += distanceScore;
            
            // Rating score (higher rating is better)
            const ratingScore = (driver.rating || 4.0) * 5; // Max 25 points
            score += ratingScore;
            
            // Vehicle type exact match bonus
            score += 20;
            
            // Activity score (more recent activity is better)
            const lastActiveMinutes = (new Date() - new Date(driver.lastActive)) / (1000 * 60);
            const activityScore = Math.max(0, (30 - lastActiveMinutes) / 30) * 10; // Max 10 points
            score += activityScore;
            
            // Response time score (based on historical data)
            const responseTimeScore = 10; // Default score
            score += responseTimeScore;
            
            console.log(`Driver ${driver.name}: vehicle=${driver.driverInfo.vehicleType}, distance=${distance.toFixed(2)}km, score=${score}`);
            
            return {
                ...driver.toObject(),
                distance,
                score,
                eta: Math.round(distance * 2) // Rough ETA calculation
            };
        });
        
        console.log(`After filtering: ${driversWithScores.length} drivers match ${vehicleType}`);
        
        // Sort by score (highest first) and distance (closest first)
        driversWithScores.sort((a, b) => {
            if (Math.abs(a.score - b.score) < 5) {
                return a.distance - b.distance; // If scores are close, prefer closer driver
            }
            return b.score - a.score;
        });
        
        // Return top 5 drivers
        return driversWithScores.slice(0, 5);
    } catch (error) {
        console.error('❌ Error in driver matching:', error);
        console.error('Error stack:', error.stack);
        return [];
    }
}

// Find nearby drivers
exports.findNearbyDrivers = async (req, res) => {
    try {
        const { latitude, longitude, vehicle_type } = req.query;
        
        if (!latitude || !longitude) {
            return res.status(400).json({ 
                success: false, 
                error: 'Latitude and longitude are required' 
            });
        }
        
        const drivers = await findNearbyDriversWithMatching(
            { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
            vehicle_type,
            req.user.id
        );
        
        res.json({ success: true, drivers });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Find drivers in zone
exports.findDriversInZone = async (req, res) => {
    try {
        const { zone } = req.query;
        
        if (!zone) {
            return res.status(400).json({ 
                success: false, 
                error: 'Zone is required' 
            });
        }
        
        const drivers = await findDriversInZone(zone);
        
        res.json({ success: true, drivers });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get upfront pricing with multiple vehicle options
exports.getUpfrontPricing = async (req, res) => {
    try {
        const { pickup_location, drop_location, vehicle_types } = req.body;
        
        if (!pickup_location || !drop_location) {
            return res.status(400).json({ 
                success: false, 
                error: 'Pickup and drop locations are required' 
            });
        }
        
        const pricingData = await fareEstimationService.getUpfrontPricing(
            pickup_location, 
            drop_location, 
            vehicle_types
        );
        
        res.json({
            success: true,
            ...pricingData
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Apply promo code to fare estimate
exports.applyPromoCode = async (req, res) => {
    try {
        const { pickup_location, drop_location, vehicle_type, promo_code } = req.body;
        
        const pricingData = await fareEstimationService.getUpfrontPricing(
            pickup_location, 
            drop_location, 
            [vehicle_type]
        );
        
        const vehicleOption = pricingData.vehicleOptions[0];
        const promoResult = await fareEstimationService.applyPromoCode(vehicleOption, promo_code);
        
        res.json({
            success: true,
            originalFare: vehicleOption.totalFare,
            ...promoResult
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Legacy fare estimation endpoint
exports.estimateFare = async (req, res) => {
    return exports.getUpfrontPricing(req, res);
};

// Submit rating and feedback
exports.submitRating = async (req, res) => {
    try {
        const { rideId } = req.params;
        const { rating, feedback, categories, tip, compliments } = req.body;
        const raterId = req.user.id;
        const raterType = req.user.role === 'driver' ? 'driver' : 'user';
        
        const result = await ratingFeedbackService.submitRating(
            rideId, 
            raterId, 
            raterType, 
            { rating, feedback, categories, tip, compliments }
        );
        
        res.json(result);
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// Check if user can rate a ride
exports.canRate = async (req, res) => {
    try {
        const { rideId } = req.params;
        const userId = req.user.id;
        
        const result = await ratingFeedbackService.canRate(rideId, userId);
        
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get rating summary for user/driver
exports.getRatingSummary = async (req, res) => {
    try {
        const userId = req.params.userId || req.user.id;
        const userType = req.user.role === 'driver' ? 'driver' : 'user';
        
        const summary = await ratingFeedbackService.getRatingsSummary(userId, userType);
        
        res.json({ success: true, summary });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Legacy calculate fare endpoint (kept for backward compatibility)
exports.calculateFare = async (req, res) => {
    return exports.getUpfrontPricing(req, res);
};

// Legacy broadcast function removed - now using DriverMatchingService.broadcastRideRequest

// Calculate surge pricing based on demand and time
async function calculateSurgePricing(pickupLocation, vehicleType) {
    try {
        const now = new Date();
        const hour = now.getHours();
        
        // Base surge factors
        let surgeMultiplier = 1.0;
        
        // Time-based surge (rush hours)
        if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
            surgeMultiplier += 0.5; // 50% increase during rush hours
        }
        
        // Weekend surge
        if (now.getDay() === 0 || now.getDay() === 6) {
            surgeMultiplier += 0.3; // 30% increase on weekends
        }
        
        // Check demand in the area (simplified - in real app, this would be based on actual demand data)
        const nearbyRides = await Ride.countDocuments({
            status: { $in: ['requested', 'accepted', 'in_progress'] },
            createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }, // Last 30 minutes
            'pickup_location.latitude': {
                $gte: pickupLocation.latitude - 0.01,
                $lte: pickupLocation.latitude + 0.01
            },
            'pickup_location.longitude': {
                $gte: pickupLocation.longitude - 0.01,
                $lte: pickupLocation.longitude + 0.01
            }
        });
        
        // Demand-based surge
        if (nearbyRides > 10) {
            surgeMultiplier += 0.4; // 40% increase for high demand
        } else if (nearbyRides > 5) {
            surgeMultiplier += 0.2; // 20% increase for medium demand
        }
        
        // Vehicle type surge
        if (vehicleType === 'suv') {
            surgeMultiplier += 0.2; // 20% increase for SUVs
        }
        
        // Cap surge at 3x
        return Math.min(surgeMultiplier, 3.0);
    } catch (error) {
        console.error('Error calculating surge pricing:', error);
        return 1.0; // Default to no surge if calculation fails
    }
}

// Get distance matrix
exports.getDistanceMatrix = async (req, res) => {
    try {
        const { origins, destinations } = req.body;
        
        if (!origins || !destinations) {
            return res.status(400).json({ 
                success: false, 
                error: 'Origins and destinations are required' 
            });
        }
        
        const matrix = await getDistanceMatrix(origins, destinations);
        
        res.json({ success: true, matrix });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Cancel ride
exports.cancelRide = async (req, res) => {
    try {
        const rideId = req.params.id;
        const userId = req.user.id;
        
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ success: false, error: 'Ride not found' });
        }
        
        // Check authorization
        if (ride.user_id.toString() !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        // Only allow cancellation if ride is not completed
        if (ride.status === 'completed') {
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot cancel completed ride' 
            });
        }
        
        ride.status = 'cancelled';
        ride.timestamps.cancelled_at = new Date();
        await ride.save();
        
        // Notify driver if ride was accepted
        if (ride.driver_id) {
            const io = req.app.get('io');
            if (io) {
                io.emit(`driver_notification_${ride.driver_id}`, {
                    type: 'ride_cancelled',
                    rideId: rideId,
                    message: 'Ride has been cancelled by the passenger',
                    timestamp: new Date()
                });
            }
        }
        
        res.json({ success: true, message: 'Ride cancelled successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Update ride status
exports.updateRideStatus = async (req, res) => {
    try {
        const rideId = req.params.id;
        const { status } = req.body;
        const userId = req.user.id;
        
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ success: false, error: 'Ride not found' });
        }
        
        // Check authorization
        if (ride.driver_id && ride.driver_id.toString() !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        ride.status = status;
        if (status === 'in_progress') {
            ride.timestamps.started_at = new Date();
        } else if (status === 'completed') {
            ride.timestamps.completed_at = new Date();
        }
        
        await ride.save();
        
        res.json({ success: true, message: 'Ride status updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Decline a ride request
exports.declineRideRequest = async (req, res) => {
    try {
        const rideId = req.params.id;
        const driverId = req.user.id;
        
        // Use matching service to handle decline
        const result = await driverMatchingService.handleDriverResponse(rideId, driverId, 'decline');
        
        res.json({ 
            success: result.success, 
            message: result.message 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Driver rate user after ride completion
exports.rateUser = async (req, res) => {
    try {
        const { rideId } = req.params;
        const { rating, feedback } = req.body;
        const driverId = req.user.id;
        
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ success: false, error: 'Ride not found' });
        }
        
        if (ride.driver_id.toString() !== driverId) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        if (ride.status !== 'completed') {
            return res.status(400).json({ success: false, error: 'Ride must be completed to rate' });
        }
        
        // Update ride with user rating from driver
        ride.user_rating = rating;
        ride.user_feedback = feedback;
        await ride.save();
        
        // Update user's average rating
        const User = require('../models/User');
        const userRides = await Ride.find({ 
            user_id: ride.user_id, 
            status: 'completed',
            user_rating: { $exists: true, $ne: null }
        });
        
        if (userRides.length > 0) {
            const avgRating = userRides.reduce((sum, r) => sum + r.user_rating, 0) / userRides.length;
            await User.findByIdAndUpdate(ride.user_id, { 
                rating: Math.round(avgRating * 10) / 10 // Round to 1 decimal place
            });
            console.log(`Updated user ${ride.user_id} rating to ${avgRating}`);
        }
        
        res.json({ success: true, message: 'User rating submitted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Regenerate OTP for ride (driver only)
exports.regenerateOTP = async (req, res) => {
    try {
        console.log('Regenerate OTP request:', {
            rideId: req.params.rideId,
            driverId: req.user.id,
            userRole: req.user.role
        });
        
        const { rideId } = req.params;
        const driverId = req.user.id;
        
        if (!rideId) {
            console.log('No ride ID provided');
            return res.status(400).json({ success: false, error: 'Ride ID is required' });
        }
        
        const ride = await Ride.findById(rideId);
        if (!ride) {
            console.log('Ride not found:', rideId);
            return res.status(404).json({ success: false, error: 'Ride not found' });
        }
        
        console.log('Found ride:', {
            id: ride._id,
            status: ride.status,
            driverId: ride.driver_id?.toString(),
            currentDriverId: driverId
        });
        
        if (!ride.driver_id || ride.driver_id.toString() !== driverId) {
            console.log('Unauthorized driver access');
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        
        if (ride.status !== 'accepted') {
            console.log('Invalid ride status for OTP regeneration:', ride.status);
            return res.status(400).json({ success: false, error: 'Can only regenerate OTP for accepted rides' });
        }
        
        // Generate new OTP
        const newOtpData = generateOTPWithExpiry(10);
        console.log('Generated new OTP:', newOtpData.code);
        
        ride.otp = newOtpData;
        await ride.save();
        console.log('Saved new OTP to ride');
        
        // Notify user about new OTP
        const io = req.app.get('io');
        if (io) {
            console.log('Sending OTP notification to user:', ride.user_id);
            io.emit(`user_notification_${ride.user_id}`, {
                type: 'otp_regenerated',
                rideId,
                message: 'Driver has requested a new OTP',
                newOtp: newOtpData.code,
                timestamp: new Date()
            });
        } else {
            console.log('Socket.io not available');
        }
        
        console.log('OTP regeneration successful');
        res.json({
            success: true,
            message: 'New OTP generated and sent to passenger',
            newOtp: newOtpData.code
        });
    } catch (err) {
        console.error('Regenerate OTP error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Test endpoint to check if ride exists
exports.testRideExists = async (req, res) => {
    try {
        const rideId = req.params.id;
        console.log('Testing ride existence for ID:', rideId);
        
        const ride = await Ride.findById(rideId);
        console.log('Found ride:', ride ? 'YES' : 'NO');
        
        if (ride) {
            console.log('Ride details:', {
                id: ride._id,
                status: ride.status,
                user_id: ride.user_id,
                driver_id: ride.driver_id
            });
        }
        
        res.json({
            success: true,
            exists: !!ride,
            ride: ride ? {
                id: ride._id,
                status: ride.status,
                user_id: ride.user_id,
                driver_id: ride.driver_id
            } : null
        });
    } catch (err) {
        console.error('Test ride error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};